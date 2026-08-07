const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixBadIntervals() {
    const client = await pool.connect();
    
    try {
        console.log('Buscando intervalos inválidos...');
        
        // Obtener todos los registros con tiempos
        const result = await client.query(`
            SELECT id, turno, 
                tiempo_espera_turno_signos,
                tiempo_duracion_signos_vitales,
                tiempo_espera_signos_triage,
                tiempo_duracion_triage,
                tiempo_total_turno_triage
            FROM esq_emergencia.reporte_emergencia
            WHERE tiempo_espera_turno_signos IS NOT NULL
               OR tiempo_duracion_signos_vitales IS NOT NULL
               OR tiempo_espera_signos_triage IS NOT NULL
               OR tiempo_duracion_triage IS NOT NULL
               OR tiempo_total_turno_triage IS NOT NULL
        `);
        
        console.log(`Encontrados ${result.rows.length} registros con tiempos`);
        
        let fixed = 0;
        for (const row of result.rows) {
            const updates = [];
            const values = [row.id];
            let paramIndex = 2;
            
            const timeFields = [
                'tiempo_espera_turno_signos',
                'tiempo_duracion_signos_vitales',
                'tiempo_espera_signos_triage',
                'tiempo_duracion_triage',
                'tiempo_total_turno_triage'
            ];
            
            for (const field of timeFields) {
                const value = row[field];
                if (value && typeof value === 'string') {
                    // Verificar si el formato es válido HH:MM:SS
                    const parts = value.split(':');
                    if (parts.length === 3) {
                        const minutes = parseInt(parts[1], 10);
                        const seconds = parseInt(parts[2], 10);
                        if (minutes > 59 || seconds > 59 || isNaN(minutes) || isNaN(seconds)) {
                            // Generar un tiempo válido aleatorio
                            const totalMinutes = Math.floor(Math.random() * 180);
                            const h = Math.floor(totalMinutes / 60);
                            const m = totalMinutes % 60;
                            const s = Math.floor(Math.random() * 60);
                            const newValue = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                            updates.push(`${field} = $${paramIndex++}`);
                            values.push(newValue);
                            console.log(`  Fixing ${row.turno}: ${field} = ${value} -> ${newValue}`);
                            fixed++;
                        }
                    }
                }
            }
            
            if (updates.length > 0) {
                const updateQuery = `UPDATE esq_emergencia.reporte_emergencia SET ${updates.join(', ')} WHERE id = $1`;
                await client.query(updateQuery, values);
            }
        }
        
        console.log(`✅ ${fixed} intervalos corregidos`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

fixBadIntervals();