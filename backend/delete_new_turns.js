const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

async function deleteNewTurns() {
    const client = await pool.connect();
    try {
        // Borrar los turnos ET1-ET50 que inserté (IDs > 1784)
        const result = await client.query(`
            DELETE FROM esq_emergencia.reporte_emergencia
            WHERE id > 1784
            AND turno LIKE 'ET%'
            AND CAST(SUBSTRING(turno FROM 3) AS INTEGER) BETWEEN 1 AND 50
        `);
        console.log('Eliminados:', result.rowCount, 'registros (ET1-ET50 nuevos)');
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

deleteNewTurns();