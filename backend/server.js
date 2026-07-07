const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// Endpoint para obtener todos los turnos
app.get('/api/turnos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                turno,
                paciente,
                fecha_turno,
                fecha_triage,
                atendido
            FROM esq_emergencia.reporte_emergencia
            ORDER BY fecha_turno DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch(error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para obtener turnos pendientes
app.get('/api/turnos/pendientes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                turno,
                paciente,
                fecha_turno,
                fecha_triage,
                atendido
            FROM esq_emergencia.reporte_emergencia
            WHERE atendido = false OR atendido IS NULL
            ORDER BY fecha_turno ASC
            LIMIT 10
        `);
        res.json(result.rows);
    } catch(error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Endpoint para avanzar al siguiente turno
app.post('/api/turnos/siguiente', async (req, res) => {
    try {
        // Obtener el turno actual pendiente (el más antiguo)
        const turnoActual = await pool.query(`
            SELECT id, turno, paciente, fecha_turno
            FROM esq_emergencia.reporte_emergencia
            WHERE atendido = false OR atendido IS NULL
            ORDER BY fecha_turno ASC
            LIMIT 1
        `);

        if (turnoActual.rows.length === 0) {
            return res.json({
                success: false,
                message: 'No hay turnos pendientes',
                turnoAtendido: null,
                siguienteTurno: null
            });
        }

        // Marcar el turno actual como atendido
        await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET atendido = true,
                fecha_triage = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [turnoActual.rows[0].id]);

        console.log(`Turno ${turnoActual.rows[0].turno} atendido`);

        // Obtener el siguiente turno pendiente
        const siguienteTurno = await pool.query(`
            SELECT id, turno, paciente, fecha_turno
            FROM esq_emergencia.reporte_emergencia
            WHERE atendido = false OR atendido IS NULL
            ORDER BY fecha_turno ASC
            LIMIT 1
        `);

        res.json({
            success: true,
            turnoAtendido: turnoActual.rows[0],
            siguienteTurno: siguienteTurno.rows[0] || null,
            message: 'Turno atendido correctamente'
        });

    } catch(error) {
        console.error('Error en siguiente turno:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint para reiniciar el sistema
app.post('/api/turnos/reiniciar', async (req, res) => {
    try {
        await pool.query(`
            UPDATE esq_emergencia.reporte_emergencia
            SET atendido = false,
                fecha_triage = NULL
        `);
        res.json({
            success: true,
            message: 'Sistema reiniciado correctamente'
        });
    } catch(error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint para obtener el turno actual
app.get('/api/turnos/actual', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, turno, paciente, fecha_turno
            FROM esq_emergencia.reporte_emergencia
            WHERE atendido = false OR atendido IS NULL
            ORDER BY fecha_turno ASC
            LIMIT 1
        `);
        res.json({
            success: true,
            turno: result.rows[0] || null
        });
    } catch(error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// --- Endpoints para Dashboard de KPIs de Emergencia ---

// Función auxiliar para construir filtros de fecha dinámicos
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

// 1. Resumen de KPIs Generales
app.get('/api/kpis/resumen', async (req, res) => {
    try {
        const { whereStr, params } = buildWhereClause(req.query);
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total_pacientes,
                COUNT(*) FILTER (WHERE atendido = true) as total_atendidos,
                COUNT(*) FILTER (WHERE atendido = false OR atendido IS NULL) as total_pendientes,
                
                COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_espera_turno_signos IS NOT NULL AND tiempo_espera_turno_signos != '' AND tiempo_espera_turno_signos LIKE '%:%:%' THEN tiempo_espera_turno_signos::interval ELSE NULL END))), 0) / 60 as avg_espera_signos,
                
                COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_duracion_signos_vitales IS NOT NULL AND tiempo_duracion_signos_vitales != '' AND tiempo_duracion_signos_vitales LIKE '%:%:%' THEN tiempo_duracion_signos_vitales::interval ELSE NULL END))), 0) / 60 as avg_duracion_signos,
                
                COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_espera_signos_triage IS NOT NULL AND tiempo_espera_signos_triage != '' AND tiempo_espera_signos_triage LIKE '%:%:%' THEN tiempo_espera_signos_triage::interval ELSE NULL END))), 0) / 60 as avg_espera_triage,
                
                COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_duracion_triage IS NOT NULL AND tiempo_duracion_triage != '' AND tiempo_duracion_triage LIKE '%:%:%' THEN tiempo_duracion_triage::interval ELSE NULL END))), 0) / 60 as avg_duracion_triage,
                
                COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN tiempo_total_turno_triage IS NOT NULL AND tiempo_total_turno_triage != '' AND tiempo_total_turno_triage LIKE '%:%:%' THEN tiempo_total_turno_triage::interval ELSE NULL END))), 0) / 60 as avg_total_triage
            FROM esq_emergencia.reporte_emergencia
            ${whereStr}
        `, params);
        
        const row = result.rows[0];
        res.json({
            total_pacientes: parseInt(row.total_pacientes) || 0,
            total_atendidos: parseInt(row.total_atendidos) || 0,
            total_pendientes: parseInt(row.total_pendientes) || 0,
            avg_espera_signos: Math.round(parseFloat(row.avg_espera_signos) * 10) / 10,
            avg_duracion_signos: Math.round(parseFloat(row.avg_duracion_signos) * 10) / 10,
            avg_espera_triage: Math.round(parseFloat(row.avg_espera_triage) * 10) / 10,
            avg_duracion_triage: Math.round(parseFloat(row.avg_duracion_triage) * 10) / 10,
            avg_total_triage: Math.round(parseFloat(row.avg_total_triage) * 10) / 10
        });
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
        const { whereStr: whereSig, params: paramsSig } = buildWhereClause(req.query, ["resp_sig_vitales IS NOT NULL AND resp_sig_vitales != ''"]);
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
        
        const { whereStr: whereTri, params: paramsTri } = buildWhereClause(req.query, ["resp_triage IS NOT NULL AND resp_triage != ''"]);
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
        const { whereStr, params } = buildWhereClause(req.query, ["fecha_turno IS NOT NULL"]);
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
        const { whereStr, params } = buildWhereClause(req.query, ["fecha_turno IS NOT NULL"]);
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

app.listen(3000, () => {
    console.log(' Servidor iniciado en puerto 3000');
});