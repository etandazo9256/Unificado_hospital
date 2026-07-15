const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const pool = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

function emitirEvento(tipo, datos) {
    io.emit(tipo, datos);
}

// --- Endpoints públicos (Sala de Espera) ---

// Sala de espera: turno actual llamado + próximos pendientes
app.get('/api/turnos/sala', async (req, res) => {
    try {
        const [turnoActual, proximos, enTriageCount] = await Promise.all([
            pool.query(`
                SELECT id, turno, paciente, fecha_llamado, consultorio
                FROM esq_emergencia.reporte_emergencia
                WHERE estado IN ('llamado', 'en_triage')
                ORDER BY fecha_llamado DESC
                LIMIT 1
            `),
            pool.query(`
                SELECT id, turno, paciente
                FROM esq_emergencia.reporte_emergencia
                WHERE estado = 'pendiente'
                ORDER BY fecha_turno ASC
                LIMIT 10
            `),
            pool.query(`
                SELECT COUNT(*) as count
                FROM esq_emergencia.reporte_emergencia
                WHERE estado = 'en_triage'
            `)
        ]);

        res.json({
            success: true,
            turnoActual: turnoActual.rows[0] || null,
            proximos: proximos.rows,
            enTriageCount: parseInt(enTriageCount.rows[0].count)
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

// Finalizar triage (en_triage -> pendiente_medico)
app.post('/api/turnos/:id/finalizar-triage', async (req, res) => {
    try {
        const { id } = req.params;
        const { prioridad, consultorio, resp_sig_vitales } = req.body || {};

        if (!prioridad) {
            return res.json({ success: false, message: 'Debe asignar una prioridad (ROJO, AMARILLO, VERDE)' });
        }

        if (!['ROJO', 'AMARILLO', 'VERDE', 'SIN CLASIFICAR'].includes(prioridad)) {
            return res.json({ success: false, message: 'Prioridad inválida. Use: ROJO, AMARILLO, VERDE o SIN CLASIFICAR' });
        }

        const result = await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET estado = 'pendiente_medico',
                fecha_fin_triage = CURRENT_TIMESTAMP,
                prioridad = $2,
                consultorio = COALESCE($3, consultorio),
                resp_sig_vitales = COALESCE($4, resp_sig_vitales)
            WHERE id = $1 AND estado = 'en_triage'
            RETURNING id, turno, paciente, prioridad, consultorio, estado
        `, [id, prioridad, consultorio || null, resp_sig_vitales || null]);

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Turno no encontrado o no está en triage' });
        }

        emitirEvento('turno:pendiente_medico', { id: result.rows[0].id, turno: result.rows[0].turno, prioridad: result.rows[0].prioridad });
        res.json({ success: true, turno: result.rows[0], message: `Triage finalizado para turno ${result.rows[0].turno}` });
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
                    WHEN 'ROJO' THEN 1
                    WHEN 'AMARILLO' THEN 2
                    WHEN 'VERDE' THEN 3
                    ELSE 4
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
        const baseCond = ["turno IS NOT NULL AND turno != ''"];
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
            GROUP BY prioridad
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
        const { whereStr: whereSig, params: paramsSig } = buildWhereClause(req.query, ["resp_sig_vitales IS NOT NULL AND resp_sig_vitales != ''", "turno IS NOT NULL AND turno != ''"]);
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

        const { whereStr: whereTri, params: paramsTri } = buildWhereClause(req.query, ["resp_triage IS NOT NULL AND resp_triage != ''", "turno IS NOT NULL AND turno != ''"]);
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
        const { whereStr, params } = buildWhereClause(req.query, ["fecha_turno IS NOT NULL", "turno IS NOT NULL AND turno != ''"]);
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
        const { whereStr, params } = buildWhereClause(req.query, ["fecha_turno IS NOT NULL", "turno IS NOT NULL AND turno != ''"]);
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

server.listen(3000, () => {
    console.log('Servidor iniciado en puerto 3000');
});
