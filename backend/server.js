const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const pool = require('./db');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// ---- Subida de matriz (CSV / Excel) ----
const uploadDir = path.join(__dirname, '..', 'temp_uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.csv', '.xlsx', '.xls'].includes(ext)) return cb(null, true);
        cb(new Error('Solo se permiten archivos .csv, .xlsx o .xls'));
    }
});

// Servir archivos estáticos del frontend
app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));

function emitirEvento(tipo, datos) {
    io.emit(tipo, datos);
}

// --- Endpoints públicos (Sala de Espera) ---

// Sala de espera: turno actual llamado + próximos pendientes
app.get('/api/turnos/sala', async (req, res) => {
    try {
        const [turnoActual, proximos, stats, llegadas, consultorios, esperaPrioridad] = await Promise.all([
            pool.query(`
                SELECT id, turno, paciente, fecha_llamado, consultorio, prioridad
                FROM esq_emergencia.reporte_emergencia
                WHERE estado IN ('llamado', 'en_triage')
                ORDER BY fecha_llamado DESC
                LIMIT 1
            `),
            pool.query(`
                SELECT id, turno, paciente, prioridad, fecha_turno, consultorio
                FROM esq_emergencia.reporte_emergencia
                WHERE estado = 'pendiente'
                ORDER BY
                    CASE COALESCE(prioridad, '')
                        WHEN 'P1-RESUCITACION' THEN 1
                        WHEN 'ROJO' THEN 1
                        WHEN 'P2-EMERGENCIA' THEN 2
                        WHEN 'NARANJA' THEN 2
                        WHEN 'P3-URGENCIA' THEN 3
                        WHEN 'AMARILLO' THEN 3
                        WHEN 'P4-MENOS_URGENTE' THEN 4
                        WHEN 'VERDE' THEN 4
                        WHEN 'P5-NO_URGENTE' THEN 5
                        WHEN 'AZUL' THEN 5
                        ELSE 6
                    END ASC,
                    id ASC
            LIMIT 20
            `),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE estado IN ('pendiente','llamado')) as pendientes,
                    COUNT(*) FILTER (WHERE estado = 'en_triage') as en_triage,
                    COUNT(*) FILTER (WHERE estado IN ('pendiente_medico','en_atencion_medica')) as en_consulta,
                    COUNT(*) FILTER (WHERE estado = 'finalizado') as atendidos,
                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN fecha_fin_atencion_medica IS NOT NULL AND fecha_inicio_atencion_medica IS NOT NULL THEN fecha_fin_atencion_medica - fecha_inicio_atencion_medica ELSE NULL END)) / 60), 0) as tiempo_promedio
                FROM esq_emergencia.reporte_emergencia
            `),
            // λ real: pacientes que llegaron en la última hora
            pool.query(`
                SELECT COUNT(*) as llegadas_ultima_hora
                FROM esq_emergencia.reporte_emergencia
                WHERE fecha_turno >= NOW() - INTERVAL '1 hour'
            `),
            // c real: consultorios actualmente activos (con pacientes en atención o pendientes)
            pool.query(`
                SELECT COUNT(DISTINCT consultorio) as consultorios_activos
                FROM esq_emergencia.reporte_emergencia
                WHERE consultorio IS NOT NULL AND consultorio != ''
                AND estado IN ('pendiente_medico', 'en_atencion_medica')
            `),
            // Tiempo de espera real promedio por prioridad Manchester (pacientes en cola)
            pool.query(`
                SELECT
                    COALESCE(NULLIF(prioridad, ''), 'SIN CLASIFICAR') as prioridad,
                    COUNT(*) as cantidad,
                    COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(fecha_turno, fecha_llamado))) / 60), 0) as espera_promedio_min
                FROM esq_emergencia.reporte_emergencia
                WHERE estado = 'pendiente'
                  AND paciente IS NOT NULL AND paciente != ''
                GROUP BY COALESCE(NULLIF(prioridad, ''), 'SIN CLASIFICAR')
            `)
        ]);

        const s = stats.rows[0];
        const llegadasHora = parseInt(llegadas.rows[0].llegadas_ultima_hora) || 0;
        const consultoriosActivos = parseInt(consultorios.rows[0].consultorios_activos) || 1;

        res.json({
            success: true,
            turnoActual: turnoActual.rows[0] || null,
            proximos: proximos.rows,
            stats: {
                pendientes: parseInt(s.pendientes) || 0,
                enTriage: parseInt(s.en_triage) || 0,
                enConsulta: parseInt(s.en_consulta) || 0,
                atendidos: parseInt(s.atendidos) || 0,
                tiempoPromedio: Math.round(parseFloat(s.tiempo_promedio) * 10) / 10,
                lambda: llegadasHora,
                consultorios: consultoriosActivos
            },
            esperaPrioridad: esperaPrioridad.rows.map(r => ({
                prioridad: r.prioridad,
                cantidad: parseInt(r.cantidad) || 0,
                esperaPromedioMin: Math.round(parseFloat(r.espera_promedio_min) * 10) / 10
            }))
        });
    } catch (error) {
        console.error('Error al obtener datos de sala:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Endpoints para Triage ---

// Turnos pendientes de ser llamados a triage
app.get('/api/turnos/pendientes-triage', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, turno, paciente, fecha_turno, prioridad, estado, consultorio
            FROM esq_emergencia.reporte_emergencia
            WHERE estado IN ('pendiente', 'llamado', 'en_triage')
            ORDER BY
                CASE WHEN estado = 'llamado' THEN 0 ELSE 1 END,
                fecha_turno ASC
            LIMIT 20
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error al obtener pendientes de triage:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Llamar al siguiente paciente (pendiente -> llamado)
app.post('/api/turnos/llamar-siguiente', async (req, res) => {
    try {
        const turno = await pool.query(`
            SELECT id, turno, paciente
            FROM esq_emergencia.reporte_emergencia
            WHERE estado = 'pendiente'
            ORDER BY fecha_turno ASC
            LIMIT 1
        `);

        if (turno.rows.length === 0) {
            return res.json({ success: false, message: 'No hay turnos pendientes', turno: null });
        }

        await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'llamado',
                fecha_llamado = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [turno.rows[0].id]);

        console.log(`Turno ${turno.rows[0].turno} llamado`);
        emitirEvento('turno:llamado', { id: turno.rows[0].id, turno: turno.rows[0].turno, paciente: turno.rows[0].paciente });

        const siguiente = await pool.query(`
            SELECT id, turno, paciente
            FROM esq_emergencia.reporte_emergencia
            WHERE estado = 'pendiente'
            ORDER BY fecha_turno ASC
            LIMIT 1
        `);

        res.json({
            success: true,
            turno: turno.rows[0],
            message: `Turno ${turno.rows[0].turno} llamado`,
            siguienteTurno: siguiente.rows[0] || null
        });
    } catch (error) {
        console.error('Error al llamar siguiente turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Llamar a un paciente específico por ID
app.post('/api/turnos/:id/llamar', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'llamado',
                fecha_llamado = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING id, turno, paciente, prioridad
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Turno no encontrado' });
        }

        console.log(`Turno ${result.rows[0].turno} llamado`);
        emitirEvento('turno:llamado', { id: result.rows[0].id, turno: result.rows[0].turno, paciente: result.rows[0].paciente });
        res.json({ success: true, turno: result.rows[0] });
    } catch (error) {
        console.error('Error al llamar turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Rellamar paciente
app.post('/api/turnos/:id/rellamar', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET fecha_llamado = CURRENT_TIMESTAMP
            WHERE id = $1 AND estado IN ('llamado', 'en_triage')
            RETURNING id, turno, paciente
        `, [id]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Turno no encontrado o no está en llamado' });
        }

        emitirEvento('turno:llamado', { id: result.rows[0].id, turno: result.rows[0].turno, paciente: result.rows[0].paciente });
        res.json({ success: true, turno: result.rows[0], message: `Re-llamando turno ${result.rows[0].turno}` });
    } catch (error) {
        console.error('Error al rellamar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Iniciar triage (llamado -> en_triage)
app.post('/api/turnos/:id/iniciar-triage', async (req, res) => {
    try {
        const { id } = req.params;
        const { resp_triage } = req.body || {};

        const result = await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'en_triage',
                fecha_inicio_triage = CURRENT_TIMESTAMP,
                resp_triage = COALESCE($2, resp_triage)
            WHERE id = $1 AND estado = 'llamado'
            RETURNING id, turno, paciente, estado
        `, [id, resp_triage || null]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Turno no encontrado o no está en estado llamado' });
        }

        emitirEvento('turno:en_triage', { id: result.rows[0].id, turno: result.rows[0].turno });
        res.json({ success: true, turno: result.rows[0], message: `Iniciando triage de turno ${result.rows[0].turno}` });
    } catch (error) {
        console.error('Error al iniciar triage:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Finalizar triage (en_triage -> en_atencion_medica, pasa directo a consulta)
app.post('/api/turnos/:id/finalizar-triage', async (req, res) => {
    try {
        const { id } = req.params;
        const { prioridad, consultorio, medico_responsable } = req.body || {};

        if (!prioridad) {
            return res.json({ success: false, message: 'Debe asignar una prioridad (Manchester o P1-P5)' });
        }

        const PRIORIDADES_VALIDAS = [
            'ROJO', 'NARANJA', 'AMARILLO', 'VERDE', 'AZUL',
            'P1-RESUCITACION', 'P2-EMERGENCIA', 'P3-URGENCIA', 'P4-MENOS_URGENTE', 'P5-NO_URGENTE'
        ];

        if (!PRIORIDADES_VALIDAS.includes(prioridad)) {
            return res.json({ success: false, message: 'Prioridad inválida. Use ROJO, NARANJA, AMARILLO, VERDE, AZUL o P1-P5' });
        }

        if (!medico_responsable) {
            return res.json({ success: false, message: 'Debe asignar el médico responsable para enviar a consulta' });
        }

        const result = await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'en_atencion_medica',
                fecha_fin_triage = CURRENT_TIMESTAMP,
                fecha_inicio_atencion_medica = CURRENT_TIMESTAMP,
                prioridad = $2,
                consultorio = COALESCE($3, consultorio),
                medico_responsable = $4
            WHERE id = $1 AND estado = 'en_triage'
            RETURNING id, turno, paciente, prioridad, consultorio, medico_responsable, estado
        `, [id, prioridad, consultorio || null, medico_responsable]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Turno no encontrado o no está en triage' });
        }

        emitirEvento('turno:en_atencion', { id: result.rows[0].id, turno: result.rows[0].turno, prioridad: result.rows[0].prioridad, medico: result.rows[0].medico_responsable });
        res.json({ success: true, turno: result.rows[0], message: `Turno ${result.rows[0].turno} enviado a consulta médica con ${result.rows[0].medico_responsable}` });
    } catch (error) {
        console.error('Error al finalizar triage:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Endpoints para Médico ---

// Pacientes pendientes de atención médica
app.get('/api/turnos/pendientes-medico', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, turno, paciente, fecha_turno,
                   fecha_fin_triage, prioridad, resp_triage,
                   consultorio, estado
            FROM esq_emergencia.reporte_emergencia
            WHERE estado = 'pendiente_medico'
            ORDER BY
                CASE prioridad
                    WHEN 'P1-RESUCITACION' THEN 1
                    WHEN 'P2-EMERGENCIA' THEN 2
                    WHEN 'P3-URGENCIA' THEN 3
                    WHEN 'P4-MENOS_URGENTE' THEN 4
                    WHEN 'P5-NO_URGENTE' THEN 5
                    ELSE 6
                END ASC,
                fecha_fin_triage ASC
            LIMIT 20
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error al obtener pendientes médico:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Pacientes actualmente en atención médica
app.get('/api/turnos/en-atencion-medica', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, turno, paciente, fecha_inicio_atencion_medica,
                   prioridad, resp_triage, medico_responsable, consultorio
            FROM esq_emergencia.reporte_emergencia
            WHERE estado = 'en_atencion_medica'
            ORDER BY fecha_inicio_atencion_medica ASC
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error al obtener pacientes en atención médica:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Iniciar atención médica (pendiente_medico -> en_atencion_medica)
app.post('/api/turnos/:id/iniciar-atencion', async (req, res) => {
    try {
        const { id } = req.params;
        const { medico_responsable } = req.body || {};

        if (!medico_responsable) {
            return res.json({ success: false, message: 'Debe especificar el médico responsable' });
        }

        const result = await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'en_atencion_medica',
                fecha_inicio_atencion_medica = CURRENT_TIMESTAMP,
                medico_responsable = $2
            WHERE id = $1 AND estado = 'pendiente_medico'
            RETURNING id, turno, paciente, medico_responsable, estado
        `, [id, medico_responsable]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Turno no encontrado o no está pendiente de médico' });
        }

        emitirEvento('turno:en_atencion', { id: result.rows[0].id, turno: result.rows[0].turno, medico: result.rows[0].medico_responsable });
        res.json({ success: true, turno: result.rows[0], message: `Iniciando atención médica de ${result.rows[0].turno}` });
    } catch (error) {
        console.error('Error al iniciar atención médica:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Finalizar atención médica (en_atencion_medica -> finalizado)
app.post('/api/turnos/:id/finalizar-atencion', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'finalizado',
                atendido = true,
                fecha_fin_atencion_medica = CURRENT_TIMESTAMP,
                fecha_triage = COALESCE(fecha_triage, CURRENT_TIMESTAMP)
            WHERE id = $1 AND estado = 'en_atencion_medica'
            RETURNING id, turno, paciente, estado
        `, [id]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Turno no encontrado o no está en atención médica' });
        }

        console.log(`Turno ${result.rows[0].turno} finalizado`);
        emitirEvento('turno:finalizado', { id: result.rows[0].id, turno: result.rows[0].turno });
        res.json({ success: true, turno: result.rows[0], message: `Atención finalizada para turno ${result.rows[0].turno}` });
    } catch (error) {
        console.error('Error al finalizar atención médica:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Acciones administrativas ---

// Marcar como no asistió
app.post('/api/turnos/:id/no-asiste', async (req, res) => {
    try {
        const { id } = req.params;
        const { observacion } = req.body || {};

        const result = await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'no_asiste',
                atendido = true,
                observacion_estado = COALESCE($2, observacion_estado, 'No asistió')
            WHERE id = $1 AND estado NOT IN ('finalizado', 'no_asiste', 'cancelado')
            RETURNING id, turno, paciente, estado
        `, [id, observacion || null]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Turno no encontrado o ya finalizado' });
        }

        emitirEvento('turno:no_asiste', { id: result.rows[0].id, turno: result.rows[0].turno });
        res.json({ success: true, turno: result.rows[0], message: `Turno ${result.rows[0].turno} marcado como no asistió` });
    } catch (error) {
        console.error('Error al marcar no asiste:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cancelar turno
app.post('/api/turnos/:id/cancelar', async (req, res) => {
    try {
        const { id } = req.params;
        const { observacion } = req.body || {};

        const result = await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'cancelado',
                atendido = true,
                observacion_estado = COALESCE($2, observacion_estado, 'Cancelado por el usuario')
            WHERE id = $1 AND estado NOT IN ('finalizado', 'no_asiste', 'cancelado')
            RETURNING id, turno, paciente, estado
        `, [id, observacion || null]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Turno no encontrado o ya finalizado' });
        }

        emitirEvento('turno:cancelado', { id: result.rows[0].id, turno: result.rows[0].turno });
        res.json({ success: true, turno: result.rows[0], message: `Turno ${result.rows[0].turno} cancelado` });
    } catch (error) {
        console.error('Error al cancelar turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reiniciar sistema
app.post('/api/turnos/reiniciar', async (req, res) => {
    try {
        await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'pendiente',
                atendido = false,
                fecha_llamado = NULL,
                fecha_inicio_triage = NULL,
                fecha_fin_triage = NULL,
                fecha_inicio_atencion_medica = NULL,
                fecha_fin_atencion_medica = NULL,
                fecha_triage = NULL,
                medico_responsable = NULL,
                observacion_estado = NULL
            WHERE estado NOT IN ('finalizado')
        `);

        emitirEvento('turno:reiniciado', {});
        res.json({ success: true, message: 'Sistema reiniciado correctamente' });
    } catch (error) {
        console.error('Error al reiniciar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Endpoints legacy (adaptados al nuevo flujo) ---

let _estadoExists = null;
async function estadoColumnExists() {
    if (_estadoExists !== null) return _estadoExists;
    try {
        await pool.query(`SELECT estado FROM esq_emergencia.reporte_emergencia LIMIT 0`);
        _estadoExists = true;
    } catch {
        _estadoExists = false;
    }
    return _estadoExists;
}

// Obtener todos los turnos
app.get('/api/turnos', async (req, res) => {
    try {
        const hasEstado = await estadoColumnExists();
        const cols = hasEstado
            ? 'id, turno, paciente, fecha_turno, fecha_llamado, fecha_triage, atendido, estado, prioridad, resp_triage, medico_responsable, consultorio'
            : 'id, turno, paciente, fecha_turno, fecha_llamado, fecha_triage, atendido, NULL as estado, prioridad, resp_sig_vitales as resp_triage, NULL as medico_responsable, NULL as consultorio';

        const result = await pool.query(`
            SELECT ${cols}
            FROM esq_emergencia.reporte_emergencia
            ORDER BY fecha_turno DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener turnos pendientes (legacy, compatibilidad)
app.get('/api/turnos/pendientes', async (req, res) => {
    try {
        const hasEstado = await estadoColumnExists();
        const result = await pool.query(`
            SELECT id, turno, paciente, fecha_turno${hasEstado ? ', estado' : ", CASE WHEN atendido THEN 'finalizado' ELSE 'pendiente' END as estado"}
            FROM esq_emergencia.reporte_emergencia
            WHERE ${hasEstado ? "estado IN ('pendiente', 'llamado', 'en_triage')" : "(atendido = false OR atendido IS NULL)"}
            ORDER BY fecha_turno ASC
            LIMIT 10
        `);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Obtener el turno actual
app.get('/api/turnos/actual', async (req, res) => {
    try {
        const hasEstado = await estadoColumnExists();
        const result = await pool.query(`
            SELECT id, turno, paciente, fecha_turno${hasEstado ? ', estado' : ", CASE WHEN atendido THEN 'finalizado' ELSE 'pendiente' END as estado"}
            FROM esq_emergencia.reporte_emergencia
            WHERE ${hasEstado ? "estado IN ('llamado', 'en_triage')" : "(atendido = false OR atendido IS NULL)"}
            ORDER BY ${hasEstado ? 'fecha_llamado' : 'fecha_turno'} ASC
            LIMIT 1
        `);
        res.json({ success: true, turno: result.rows[0] || null });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Siguiente turno legacy (ahora redirige a llamar-siguiente)
app.post('/api/turnos/siguiente', async (req, res) => {
    try {
        const turno = await pool.query(`
            SELECT id, turno, paciente
            FROM esq_emergencia.reporte_emergencia
            WHERE estado = 'pendiente'
            ORDER BY fecha_turno ASC
            LIMIT 1
        `);

        if (turno.rows.length === 0) {
            return res.json({
                success: false,
                message: 'No hay turnos pendientes',
                turnoAtendido: null,
                siguienteTurno: null
            });
        }

        await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'llamado', fecha_llamado = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [turno.rows[0].id]);

        const siguiente = await pool.query(`
            SELECT id, turno, paciente
            FROM esq_emergencia.reporte_emergencia
            WHERE estado = 'pendiente'
            ORDER BY fecha_turno ASC
            LIMIT 1
        `);

        emitirEvento('turno:llamado', { id: turno.rows[0].id, turno: turno.rows[0].turno, paciente: turno.rows[0].paciente });
        res.json({
            success: true,
            turnoAtendido: turno.rows[0],
            siguienteTurno: siguiente.rows[0] || null,
            message: 'Turno llamado correctamente'
        });
    } catch (error) {
        console.error('Error en siguiente turno:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Endpoint para listar personal responsable ---
app.get('/api/personal', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT nombre, tipo FROM (
                SELECT resp_sig_vitales AS nombre, 'signos_vitales' AS tipo
                FROM esq_emergencia.reporte_emergencia
                WHERE resp_sig_vitales IS NOT NULL AND resp_sig_vitales != ''
                UNION
                SELECT resp_triage AS nombre, 'triage' AS tipo
                FROM esq_emergencia.reporte_emergencia
                WHERE resp_triage IS NOT NULL AND resp_triage != ''
                UNION
                SELECT medico_responsable AS nombre, 'medico' AS tipo
                FROM esq_emergencia.reporte_emergencia
                WHERE medico_responsable IS NOT NULL AND medico_responsable != ''
            ) AS personal
            ORDER BY nombre
        `);
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error al obtener personal:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Endpoints para Dashboard de KPIs de Emergencia ---

function buildWhereClause(query, baseConditions = []) {
    const conditions = [...baseConditions];
    const params = [];
    let paramIndex = 1;

    if (query.fechaInicio) {
        conditions.push(`fecha_turno >= $${paramIndex}`);
        params.push(`${query.fechaInicio} 00:00:00`);
        paramIndex++;
    }
    if (query.fechaFin) {
        conditions.push(`fecha_turno <= $${paramIndex}`);
        params.push(`${query.fechaFin} 23:59:59`);
        paramIndex++;
    }

    const whereStr = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereStr, params };
}

// 1. Resumen de KPIs Generales (compatible con y sin columna estado)
app.get('/api/kpis/resumen', async (req, res) => {
    try {
        const baseCond = ["paciente IS NOT NULL AND paciente != ''"];
        const { whereStr, params } = buildWhereClause(req.query, baseCond);
        let row;

        try {
            const result = await pool.query(`
                SELECT
                    COUNT(*) as total_pacientes,
                    COUNT(*) FILTER (WHERE estado = 'finalizado') as total_atendidos,
                    COUNT(*) FILTER (WHERE estado IN ('pendiente','llamado','en_triage','pendiente_medico','en_atencion_medica')) as total_pendientes,
                    COUNT(*) FILTER (WHERE estado = 'en_triage') as en_triage,
                    COUNT(*) FILTER (WHERE estado = 'pendiente_medico') as pendiente_medico,
                    COUNT(*) FILTER (WHERE estado = 'en_atencion_medica') as en_atencion_medica,

                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_espera_turno_signos IS NOT NULL AND tiempo_espera_turno_signos != '' AND tiempo_espera_turno_signos LIKE '%:%:%' THEN tiempo_espera_turno_signos::interval ELSE NULL END))), 0) / 60 as avg_espera_signos,

                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_duracion_signos_vitales IS NOT NULL AND tiempo_duracion_signos_vitales != '' AND tiempo_duracion_signos_vitales LIKE '%:%:%' THEN tiempo_duracion_signos_vitales::interval ELSE NULL END))), 0) / 60 as avg_duracion_signos,

                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_espera_signos_triage IS NOT NULL AND tiempo_espera_signos_triage != '' AND tiempo_espera_signos_triage LIKE '%:%:%' THEN tiempo_espera_signos_triage::interval ELSE NULL END))), 0) / 60 as avg_espera_triage,

                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_duracion_triage IS NOT NULL AND tiempo_duracion_triage != '' AND tiempo_duracion_triage LIKE '%:%:%' THEN tiempo_duracion_triage::interval ELSE NULL END))), 0) / 60 as avg_duracion_triage,

                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_total_turno_triage IS NOT NULL AND tiempo_total_turno_triage != '' AND tiempo_total_turno_triage LIKE '%:%:%' THEN tiempo_total_turno_triage::interval ELSE NULL END))), 0) / 60 as avg_total_triage
                FROM esq_emergencia.reporte_emergencia
                ${whereStr}
            `, params);
            row = result.rows[0];

            res.json({
                total_pacientes: parseInt(row.total_pacientes) || 0,
                total_atendidos: parseInt(row.total_atendidos) || 0,
                total_pendientes: parseInt(row.total_pendientes) || 0,
                en_triage: parseInt(row.en_triage) || 0,
                pendiente_medico: parseInt(row.pendiente_medico) || 0,
                en_atencion_medica: parseInt(row.en_atencion_medica) || 0,
                avg_espera_signos: Math.round(parseFloat(row.avg_espera_signos) * 10) / 10,
                avg_duracion_signos: Math.round(parseFloat(row.avg_duracion_signos) * 10) / 10,
                avg_espera_triage: Math.round(parseFloat(row.avg_espera_triage) * 10) / 10,
                avg_duracion_triage: Math.round(parseFloat(row.avg_duracion_triage) * 10) / 10,
                avg_total_triage: Math.round(parseFloat(row.avg_total_triage) * 10) / 10
            });
        } catch (innerErr) {
            const result = await pool.query(`
                SELECT
                    COUNT(*) as total_pacientes,
                    COUNT(*) FILTER (WHERE atendido = true) as total_atendidos,
                    COUNT(*) FILTER (WHERE atendido = false OR atendido IS NULL) as total_pendientes,
                    0 as en_triage,
                    0 as pendiente_medico,
                    0 as en_atencion_medica,

                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_espera_turno_signos IS NOT NULL AND tiempo_espera_turno_signos != '' AND tiempo_espera_turno_signos LIKE '%:%:%' THEN tiempo_espera_turno_signos::interval ELSE NULL END))), 0) / 60 as avg_espera_signos,

                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_duracion_signos_vitales IS NOT NULL AND tiempo_duracion_signos_vitales != '' AND tiempo_duracion_signos_vitales LIKE '%:%:%' THEN tiempo_duracion_signos_vitales::interval ELSE NULL END))), 0) / 60 as avg_duracion_signos,

                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_espera_signos_triage IS NOT NULL AND tiempo_espera_signos_triage != '' AND tiempo_espera_signos_triage LIKE '%:%:%' THEN tiempo_espera_signos_triage::interval ELSE NULL END))), 0) / 60 as avg_espera_triage,

                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_duracion_triage IS NOT NULL AND tiempo_duracion_triage != '' AND tiempo_duracion_triage LIKE '%:%:%' THEN tiempo_duracion_triage::interval ELSE NULL END))), 0) / 60 as avg_duracion_triage,

                    COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_total_turno_triage IS NOT NULL AND tiempo_total_turno_triage != '' AND tiempo_total_turno_triage LIKE '%:%:%' THEN tiempo_total_turno_triage::interval ELSE NULL END))), 0) / 60 as avg_total_triage
                FROM esq_emergencia.reporte_emergencia
                ${whereStr}
            `, params);
            row = result.rows[0];

            res.json({
                total_pacientes: parseInt(row.total_pacientes) || 0,
                total_atendidos: parseInt(row.total_atendidos) || 0,
                total_pendientes: parseInt(row.total_pendientes) || 0,
                en_triage: 0,
                pendiente_medico: 0,
                en_atencion_medica: 0,
                avg_espera_signos: Math.round(parseFloat(row.avg_espera_signos) * 10) / 10,
                avg_duracion_signos: Math.round(parseFloat(row.avg_duracion_signos) * 10) / 10,
                avg_espera_triage: Math.round(parseFloat(row.avg_espera_triage) * 10) / 10,
                avg_duracion_triage: Math.round(parseFloat(row.avg_duracion_triage) * 10) / 10,
                avg_total_triage: Math.round(parseFloat(row.avg_total_triage) * 10) / 10
            });
        }
    } catch (error) {
        console.error('Error al obtener resumen de KPIs:', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Distribución de pacientes por prioridad de Triage
app.get('/api/kpis/prioridad', async (req, res) => {
    try {
        const { whereStr, params } = buildWhereClause(req.query);
        const result = await pool.query(`
            SELECT
                COALESCE(prioridad, 'SIN CLASIFICAR') as prioridad,
                COUNT(*) as cantidad
            FROM esq_emergencia.reporte_emergencia
            ${whereStr}
            GROUP BY COALESCE(prioridad, 'SIN CLASIFICAR')
            ORDER BY cantidad DESC
        `, params);
        res.json(result.rows.map(r => ({
            prioridad: r.prioridad,
            cantidad: parseInt(r.cantidad) || 0
        })));
    } catch (error) {
        console.error('Error al obtener distribución de prioridades:', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Productividad del personal (Top 5)
app.get('/api/kpis/productividad', async (req, res) => {
    try {
        const { whereStr: whereSig, params: paramsSig } = buildWhereClause(req.query, ["resp_sig_vitales IS NOT NULL AND resp_sig_vitales != ''", "paciente IS NOT NULL AND paciente != ''"]);
        const signosResult = await pool.query(`
            SELECT
                resp_sig_vitales as personal,
                COUNT(*) as cantidad
            FROM esq_emergencia.reporte_emergencia
            ${whereSig}
            GROUP BY resp_sig_vitales
            ORDER BY cantidad DESC
            LIMIT 5
        `, paramsSig);

        const { whereStr: whereTri, params: paramsTri } = buildWhereClause(req.query, ["resp_triage IS NOT NULL AND resp_triage != ''", "paciente IS NOT NULL AND paciente != ''"]);
        const triageResult = await pool.query(`
            SELECT
                resp_triage as personal,
                COUNT(*) as cantidad
            FROM esq_emergencia.reporte_emergencia
            ${whereTri}
            GROUP BY resp_triage
            ORDER BY cantidad DESC
            LIMIT 5
        `, paramsTri);

        res.json({
            signos_vitales: signosResult.rows.map(r => ({ personal: r.personal, cantidad: parseInt(r.cantidad) || 0 })),
            triage: triageResult.rows.map(r => ({ personal: r.personal, cantidad: parseInt(r.cantidad) || 0 }))
        });
    } catch (error) {
        console.error('Error al obtener productividad del personal:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Tendencia por hora del día
app.get('/api/kpis/tendencia-hora', async (req, res) => {
    try {
        const { whereStr, params } = buildWhereClause(req.query, ["fecha_turno IS NOT NULL", "paciente IS NOT NULL AND paciente != ''"]);
        const result = await pool.query(`
            SELECT
                EXTRACT(HOUR FROM fecha_turno) as hora,
                COUNT(*) as cantidad
            FROM esq_emergencia.reporte_emergencia
            ${whereStr}
            GROUP BY EXTRACT(HOUR FROM fecha_turno)
            ORDER BY hora ASC
        `, params);
        res.json(result.rows.map(r => ({
            hora: parseInt(r.hora),
            cantidad: parseInt(r.cantidad) || 0
        })));
    } catch (error) {
        console.error('Error al obtener tendencia por hora:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Tendencia por fecha
app.get('/api/kpis/tendencia-fecha', async (req, res) => {
    try {
        const { whereStr, params } = buildWhereClause(req.query, ["fecha_turno IS NOT NULL", "paciente IS NOT NULL AND paciente != ''"]);
        const result = await pool.query(`
            SELECT
                DATE(fecha_turno) as fecha,
                COUNT(*) as cantidad,
                COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_total_turno_triage IS NOT NULL AND tiempo_total_turno_triage != '' AND tiempo_total_turno_triage LIKE '%:%:%' THEN tiempo_total_turno_triage::interval ELSE NULL END))), 0) / 60 as avg_total_triage
            FROM esq_emergencia.reporte_emergencia
            ${whereStr}
            GROUP BY DATE(fecha_turno)
            ORDER BY fecha ASC
        `, params);
        res.json(result.rows.map(r => ({
            fecha: r.fecha,
            cantidad: parseInt(r.cantidad) || 0,
            avg_total_triage: Math.round(parseFloat(r.avg_total_triage) * 10) / 10
        })));
    } catch (error) {
        console.error('Error al obtener tendencia por fecha:', error);
        res.status(500).json({ error: error.message });
    }
});

// 5.1 Estado actual de la sala (conteo en tiempo real por etapa del flujo)
app.get('/api/kpis/estado-sala', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT estado, COUNT(*) as cantidad
            FROM esq_emergencia.reporte_emergencia
            WHERE paciente IS NOT NULL AND paciente != ''
            GROUP BY estado
        `);

        const counts = {
            en_espera: 0,
            llamado: 0,
            en_triage: 0,
            pendiente_medico: 0,
            en_atencion_medica: 0
        };

        result.rows.forEach(r => {
            if (r.estado === 'pendiente') counts.en_espera = parseInt(r.cantidad) || 0;
            else if (counts[r.estado] !== undefined) counts[r.estado] = parseInt(r.cantidad) || 0;
        });

        res.json(counts);
    } catch (error) {
        console.error('Error al obtener estado de sala:', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Alertas de pacientes en espera prolongada (estándar Manchester)
app.get('/api/kpis/alertas', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, turno, paciente, prioridad, estado, consultorio,
                   COALESCE(fecha_turno, fecha_llamado, fecha_inicio_triage, fecha_triage) as fecha_referencia
            FROM esq_emergencia.reporte_emergencia
            WHERE estado IN ('pendiente','llamado','en_triage','pendiente_medico','en_atencion_medica')
              AND paciente IS NOT NULL AND paciente != ''
            ORDER BY fecha_referencia ASC
        `);

        const tiemposObjetivo = {
            'P1-RESUCITACION': 0,
            'ROJO': 10,
            'P2-EMERGENCIA': 10,
            'P3-URGENCIA': 60,
            'AMARILLO': 60,
            'P4-MENOS_URGENTE': 120,
            'VERDE': 120,
            'P5-NO_URGENTE': 240,
            'SIN CLASIFICAR': 60
        };

        const ahora = new Date();
        const alertas = result.rows.filter(p => {
            if (!p.fecha_referencia) return false;
            const esperaMin = (ahora - new Date(p.fecha_referencia)) / 60000;
            const objetivo = tiemposObjetivo[p.prioridad] !== undefined ? tiemposObjetivo[p.prioridad] : 60;
            return esperaMin > objetivo;
        }).map(p => ({
            id: p.id,
            turno: p.turno || '',
            paciente: p.paciente,
            prioridad: p.prioridad,
            estado: p.estado,
            consultorio: p.consultorio,
            minutos_espera: Math.round((ahora - new Date(p.fecha_referencia)) / 60000)
        }));

        res.json({ total: alertas.length, alertas });
    } catch (error) {
        console.error('Error al obtener alertas de espera:', error);
        res.status(500).json({ error: error.message });
    }
});

async function calcularResumenPeriodo(inicio, fin) {
    const result = await pool.query(`
        SELECT
            COUNT(*) as total_pacientes,
            COUNT(*) FILTER (WHERE estado = 'finalizado') as total_atendidos,
            COUNT(*) FILTER (WHERE estado IN ('pendiente','llamado','en_triage','pendiente_medico','en_atencion_medica')) as total_pendientes,
            COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_total_turno_triage IS NOT NULL AND tiempo_total_turno_triage != '' AND tiempo_total_turno_triage LIKE '%:%:%' THEN tiempo_total_turno_triage::interval ELSE NULL END))), 0) / 60 as avg_total_triage
        FROM esq_emergencia.reporte_emergencia
        WHERE paciente IS NOT NULL AND paciente != ''
          AND fecha_turno IS NOT NULL
          AND fecha_turno >= $1 AND fecha_turno <= $2
    `, [inicio, fin]);
    const row = result.rows[0];
    return {
        total_pacientes: parseInt(row.total_pacientes) || 0,
        total_atendidos: parseInt(row.total_atendidos) || 0,
        total_pendientes: parseInt(row.total_pendientes) || 0,
        avg_total_triage: Math.round(parseFloat(row.avg_total_triage) * 10) / 10
    };
}

// 7. Comparación de KPIs con período anterior (mini-tendencias)
app.get('/api/kpis/comparar', async (req, res) => {
    try {
        const { query } = req;
        let inicio, fin;

        if (query.fechaInicio && query.fechaFin) {
            inicio = new Date(`${query.fechaInicio}T00:00:00`);
            fin = new Date(`${query.fechaFin}T23:59:59`);
        } else {
            const { rows: [rango] } = await pool.query(`
                SELECT COALESCE(MAX(fecha_turno), CURRENT_TIMESTAMP) as max_fecha
                FROM esq_emergencia.reporte_emergencia
                WHERE paciente IS NOT NULL AND paciente != ''
            `);
            fin = new Date(rango.max_fecha);
            inicio = new Date(fin);
            inicio.setDate(inicio.getDate() - 30);
        }

        const duracion = fin.getTime() - inicio.getTime();
        const prevFin = new Date(inicio.getTime() - 1000);
        const prevIni = new Date(prevFin.getTime() - duracion);

        const [actual, anterior] = await Promise.all([
            calcularResumenPeriodo(inicio.toISOString(), fin.toISOString()),
            calcularResumenPeriodo(prevIni.toISOString(), prevFin.toISOString())
        ]);

        res.json({ actual, anterior });
    } catch (error) {
        console.error('Error al obtener comparación de KPIs:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// IMPORTACIÓN DE MATRIZ (CSV / Excel) → esq_emergencia.reporte_emergencia
// ============================================================================

// Valores que significan "vacío". Un CSV exportado de la base de datos trae "NULL" como texto.
const VALORES_NULOS = new Set(['', 'null', 'nan', 'nat', 'none', 'undefined']);

function esNulo(v) {
    return v === null || v === undefined || VALORES_NULOS.has(String(v).trim().toLowerCase());
}

function normalizarTexto(v) {
    return esNulo(v) ? '' : String(v).trim();
}

function normalizarClave(c) {
    return String(c ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_');
}

// Nombres de columna aceptados en el archivo para cada columna de la tabla.
// Sirve tanto el Excel del hospital (1.er nombre) como un CSV exportado de la BD (2.º nombre).
const COLUMNAS_ARCHIVO = {
    numero: ['numero'],
    prioridad: ['color_letras', 'prioridad'],
    estado: ['estado_registro', 'estado'],
    atendido: ['atendido'],
    turno: ['turno'],
    paciente: ['paciente'],
    fecha_turno: ['fecha_turno'],
    fecha_llamado: ['fecha_llamado'],
    fecha_sig_vitales: ['fecha_signos_vitales', 'fecha_sig_vitales'],
    fecha_triage: ['fecha_triage'],
    fecha_ing_observacion: ['fecha_ingreso_observacion', 'fecha_ing_observacion'],
    fecha_soli_hosp: ['fecha_solicitud_hospitalizacion', 'fecha_soli_hosp'],
    fecha_ing_hospitalizacion: ['fecha_ing_hospitalizacion'],
    fecha_inicio_triage: ['fecha_inicio_triage'],
    fecha_fin_triage: ['fecha_fin_triage'],
    fecha_inicio_atencion_medica: ['fecha_inicio_atencion_medica'],
    fecha_fin_atencion_medica: ['fecha_fin_atencion_medica'],
    resp_sig_vitales: ['responsable_sig_vitales', 'resp_sig_vitales'],
    resp_triage: ['responsable_atencion_triage', 'resp_triage'],
    tiempo_espera_turno_signos: ['tiempo_espera_turnos_a_signos', 'tiempo_espera_turno_signos'],
    tiempo_duracion_signos_vitales: ['tiempo_duracion_signos_vitales'],
    tiempo_espera_signos_triage: ['tiempo_espera_signos_a_llamado_triage', 'tiempo_espera_signos_triage'],
    tiempo_duracion_triage: ['tiempo_duracion_triage'],
    tiempo_total_turno_triage: ['tiempo_total_turno_a_triage', 'tiempo_total_turno_triage'],
    medico_responsable: ['medico_responsable'],
    consultorio: ['consultorio'],
    observacion_estado: ['resultado_observacion', 'observacion_estado']
};
const COLUMNAS_BD = Object.keys(COLUMNAS_ARCHIVO);
const COLS_FECHA = COLUMNAS_BD.filter(c => c.startsWith('fecha_'));
const COLS_TEXTO = COLUMNAS_BD.filter(c => !COLS_FECHA.includes(c) && !['numero', 'prioridad', 'estado', 'atendido'].includes(c));

const ESTADOS_VALIDOS = new Set(['pendiente', 'llamado', 'en_triage', 'pendiente_medico', 'en_atencion_medica', 'finalizado', 'no_asiste', 'cancelado']);

function mapearPrioridad(v) {
    const s = normalizarTexto(v).toUpperCase();
    if (!s) return null;
    const tabla = { 'AMARRILLO': 'AMARILLO' };
    return tabla[s] || s;
}

function mapearEstado(v, huboSignos, huboMedico) {
    const s = normalizarTexto(v).toUpperCase();
    if (!s) return 'pendiente';
    if (ESTADOS_VALIDOS.has(s.toLowerCase())) return s.toLowerCase(); // CSV exportado de la BD
    if (s.includes('ATENCION MEDICA REGISTRADOS') || s.includes('ATENCIÓN MÉDICA REGISTRADOS')) return 'finalizado';
    if (s.includes('SIN ATENCION MEDICA') || s.includes('SIN ATENCIÓN MÉDICA')) return 'en_triage';
    if (s.includes('SIGNOS') && huboSignos === 'SI') return 'en_triage';
    return 'pendiente';
}

function mapearAtendido(huboSignos, huboMedico) {
    return huboMedico === 'SI' || huboMedico === 'TRUE';
}

const dos = (n) => String(n).padStart(2, '0');

function limpiarFecha(v) {
    if (esNulo(v)) return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().replace('T', ' ').replace('Z', '');
    const s = String(v).trim();
    // d/m/aaaa [h:mm[:ss]] -> así guarda las fechas Excel en Ecuador (día primero)
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
        const [, d, mo, y, h = '0', mi = '0', se = '0'] = m;
        if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
        return `${y}-${dos(mo)}-${dos(d)} ${dos(h)}:${dos(mi)}:${dos(se)}`;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.replace('T', ' ');
    return s; // ISO u otro formato que PostgreSQL entienda
}

// CSV con soporte de comillas, BOM y delimitador ; , o tabulador
function parsearCSV(texto) {
    texto = texto.replace(/^\uFEFF/, '');
    const primera = texto.split(/\r?\n/, 1)[0];
    const delimitador = [';', ',', '\t'].map(d => [d, primera.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
    const filas = [];
    let fila = [], campo = '', comillas = false;
    const cerrarFila = () => {
        fila.push(campo); campo = '';
        if (fila.some(x => x.trim() !== '')) filas.push(fila);
        fila = [];
    };
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (comillas) {
            if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
            else campo += c;
        } else if (c === '"') comillas = true;
        else if (c === delimitador) { fila.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; cerrarFila(); }
        else campo += c;
    }
    cerrarFila();
    return filas;
}

function leerArchivo(ruta) {
    const ext = path.extname(ruta).toLowerCase();
    let objetos;
    if (ext === '.csv') {
        const matriz = parsearCSV(fs.readFileSync(ruta, 'utf8'));
        if (matriz.length === 0) return { filas: [] };
        const cabecera = matriz[0].map(normalizarClave);
        objetos = matriz.slice(1).map(vals => {
            const obj = {};
            cabecera.forEach((c, i) => { obj[c] = vals[i] !== undefined ? vals[i] : ''; });
            return obj;
        });
    } else { // .xlsx / .xls
        const libro = XLSX.readFile(ruta);
        const hoja = libro.Sheets[libro.SheetNames[0]];
        objetos = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false }).map(o => {
            const obj = {};
            Object.keys(o).forEach(k => { obj[normalizarClave(k)] = o[k]; });
            return obj;
        });
    }
    return { filas: objetos };
}

function construirFilasBD(filas, mapeo) {
    const salida = [];
    filas.forEach(filaRaw => {
        const obtener = (...nombres) => {
            for (const n of nombres) if (Object.prototype.hasOwnProperty.call(filaRaw, n) && !esNulo(filaRaw[n])) return filaRaw[n];
            return '';
        };
        // Con emparejamiento manual solo se usa la columna elegida; sin él, los nombres conocidos
        const nombresDe = (col) => (mapeo ? (mapeo[col] ? [mapeo[col]] : []) : COLUMNAS_ARCHIVO[col]);
        const ver = (col) => obtener(...nombresDe(col));

        const numeroTxt = normalizarTexto(ver('numero'));
        const turno = normalizarTexto(ver('turno'));
        const fechaTurno = limpiarFecha(ver('fecha_turno'));
        if (!numeroTxt && !turno && !fechaTurno) return; // fila vacía

        const huboSignos = normalizarTexto(obtener('hubo_toma_signos_vitales')).toUpperCase();
        const huboMedico = normalizarTexto(obtener('hubo_atencion_medica')).toUpperCase();
        const atendidoTxt = normalizarTexto(ver('atendido')).toLowerCase();
        const n = parseInt(numeroTxt, 10);

        const fila = {
            numero: Number.isNaN(n) ? null : n,
            prioridad: mapearPrioridad(ver('prioridad')),
            estado: mapearEstado(ver('estado'), huboSignos, huboMedico),
            atendido: atendidoTxt !== '' ? ['true', 't', '1', 'si'].includes(atendidoTxt) : mapearAtendido(huboSignos, huboMedico)
        };
        COLS_FECHA.forEach(c => { fila[c] = limpiarFecha(ver(c)); });
        COLS_TEXTO.forEach(c => { fila[c] = normalizarTexto(ver(c)) || null; });
        salida.push(fila);
    });
    return salida;
}

// Clave natural para detectar duplicados: numero + turno + fecha_turno (al minuto,
// porque un CSV pasado por Excel pierde los segundos)
function claveFila(numero, turno, fecha) {
    return `${numero ?? ''}|${turno ?? ''}|${fecha ? String(fecha).slice(0, 16) : ''}`;
}

// Compara el archivo contra lo que ya hay en la base. Cuenta repeticiones: si el archivo trae
// 7 filas con la misma clave y la base ya tiene 7, son las mismas; si la base tiene menos, entra el resto.
function separarNuevos(filasBD, existentes) {
    const enBase = new Map();
    existentes.forEach(r => {
        const k = claveFila(r.numero, r.turno, r.ft);
        enBase.set(k, (enBase.get(k) || 0) + 1);
    });
    const nuevos = [];
    let duplicados = 0;
    filasBD.forEach(f => {
        const k = claveFila(f.numero, f.turno, f.fecha_turno);
        const quedan = enBase.get(k) || 0;
        if (quedan > 0) { enBase.set(k, quedan - 1); duplicados++; return; }
        nuevos.push(f);
    });
    return { nuevos, duplicados };
}

app.post('/api/matriz/importar', upload.single('archivo'), async (req, res) => {
    let rutaArchivo = null;
    let client = null;
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No se envió ningún archivo' });
        rutaArchivo = req.file.path;

        // Emparejamiento columnas del archivo -> campos de la BD (lo elige el usuario en la ventana)
        let mapeo = null;
        if (req.body && req.body.mapeo) {
            try { mapeo = JSON.parse(req.body.mapeo); } catch { mapeo = undefined; }
            if (!mapeo || typeof mapeo !== 'object' || Array.isArray(mapeo)) {
                return res.status(400).json({ success: false, error: 'El emparejamiento de columnas no es válido' });
            }
            const faltan = CAMPOS_REQUERIDOS.filter(c => !mapeo[c]);
            if (faltan.length) {
                return res.status(400).json({ success: false, error: 'Falta asignar: ' + faltan.map(c => ETIQUETAS_CAMPOS[c] || c).join(', ') });
            }
        }

        const { filas } = leerArchivo(rutaArchivo);
        if (filas.length === 0) {
            return res.status(400).json({ success: false, error: 'El archivo no contiene filas de datos' });
        }
        const filasBD = construirFilasBD(filas, mapeo);
        if (filasBD.length === 0) {
            return res.status(400).json({ success: false, error: 'No se reconoció ninguna fila válida. Revisa los nombres de las columnas.' });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        // Registros que ya existen en la base
        const { rows: existentes } = await client.query(`
            SELECT numero, turno, to_char(fecha_turno, 'YYYY-MM-DD HH24:MI') AS ft
            FROM esq_emergencia.reporte_emergencia`);
        const { nuevos, duplicados } = separarNuevos(filasBD, existentes);

        // Los ids continúan desde el mayor existente
        const { rows: [{ max }] } = await client.query(`SELECT COALESCE(MAX(id), 0) AS max FROM esq_emergencia.reporte_emergencia`);
        let siguienteId = Number(max);
        nuevos.forEach(f => { f.id = ++siguienteId; });

        // Insertar en lotes (para no exceder el límite de parámetros de PostgreSQL)
        const LOTE = 100;
        const COLS_CON_ID = ['id', ...COLUMNAS_BD];
        for (let i = 0; i < nuevos.length; i += LOTE) {
            const lote = nuevos.slice(i, i + LOTE);
            const placeholders = lote.map((_, k) =>
                '(' + COLS_CON_ID.map((_, j) => `$${k * COLS_CON_ID.length + j + 1}`).join(',') + ')'
            ).join(', ');
            const params = [];
            lote.forEach(f => COLS_CON_ID.forEach(c => params.push(f[c])));
            await client.query(`INSERT INTO esq_emergencia.reporte_emergencia (${COLS_CON_ID.join(', ')}) VALUES ${placeholders}`, params);
        }
        await client.query('COMMIT');

        const insertados = nuevos.length;
        if (insertados > 0) {
            // Notificar a todas las pantallas que la matriz se actualizó
            emitirEvento('matriz:actualizada', {
                insertados, duplicados,
                totalArchivo: filasBD.length,
                archivo: req.file.originalname,
                fecha: new Date().toISOString()
            });
        }

        let mensaje;
        if (insertados === 0) {
            mensaje = `Se subieron 0 datos nuevos: los ${duplicados} registro(s) del archivo ya existían.`;
        } else {
            mensaje = `Se cargaron ${insertados} dato(s) nuevo(s).` +
                (duplicados > 0 ? ` ${duplicados} registro(s) ya existían y se omitieron.` : '');
        }
        res.json({ success: true, mensaje, insertados, duplicados, totalArchivo: filasBD.length });

    } catch (error) {
        if (client) { try { await client.query('ROLLBACK'); } catch { /* ignorar */ } }
        console.error('Error importando matriz:', error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (client) client.release();
        if (rutaArchivo && fs.existsSync(rutaArchivo)) {
            try { fs.unlinkSync(rutaArchivo); } catch { /* ignorar */ }
        }
    }
});

// ---- Paso previo a importar: lee las columnas del archivo y sugiere el emparejamiento ----
const ETIQUETAS_CAMPOS = {
    numero: 'Número', turno: 'Turno', paciente: 'Paciente', prioridad: 'Prioridad (color Manchester)',
    estado: 'Estado', atendido: 'Atendido', fecha_turno: 'Fecha del turno', fecha_llamado: 'Fecha de llamado',
    fecha_sig_vitales: 'Fecha de signos vitales', fecha_triage: 'Fecha de triage',
    resp_sig_vitales: 'Responsable de signos vitales', resp_triage: 'Responsable de triage',
    medico_responsable: 'Médico responsable', consultorio: 'Consultorio', observacion_estado: 'Observación del estado'
};
const CAMPOS_REQUERIDOS = ['turno', 'fecha_turno', 'prioridad'];

app.post('/api/matriz/analizar', upload.single('archivo'), (req, res) => {
    const ruta = req.file ? req.file.path : null;
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No se envió ningún archivo' });
        const { filas } = leerArchivo(ruta);
        if (filas.length === 0) {
            return res.status(400).json({ success: false, error: 'El archivo no contiene filas de datos' });
        }
        const columnas = Object.keys(filas[0]);
        const muestra = {};
        columnas.forEach(c => {
            const fila = filas.find(r => !esNulo(r[c]));
            muestra[c] = fila ? String(fila[c]).slice(0, 40) : '';
        });
        const campos = COLUMNAS_BD.map(campo => ({
            campo,
            etiqueta: ETIQUETAS_CAMPOS[campo] || campo.replace(/_/g, ' '),
            requerido: CAMPOS_REQUERIDOS.includes(campo),
            sugerida: COLUMNAS_ARCHIVO[campo].find(n => columnas.includes(n)) || ''
        })).sort((a, b) => Number(b.requerido) - Number(a.requerido));
        res.json({ success: true, archivo: req.file.originalname, totalFilas: filas.length, columnas, muestra, campos });
    } catch (error) {
        console.error('Error analizando matriz:', error);
        res.status(500).json({ success: false, error: 'No se pudo leer el archivo: ' + error.message });
    } finally {
        if (ruta && fs.existsSync(ruta)) { try { fs.unlinkSync(ruta); } catch { /* ignorar */ } }
    }
});

// Errores de subida (extensión no permitida, archivo demasiado grande...) siempre en JSON
app.use((err, req, res, next) => {
    if (res.headersSent || !req.path.startsWith('/api/')) return next(err);
    const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera los 50 MB' : err.message;
    res.status(400).json({ success: false, error: mensaje });
});

// Ruta catch-all: sirve el menú unificado para rutas raíz
app.get('/{*path}', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/frontend/')) return;
    res.sendFile(path.join(__dirname, '..', 'frontend', 'menu.html'));
});

server.listen(3000, () => {
    console.log('Servidor iniciado en puerto 3000');
});