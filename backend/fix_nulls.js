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

async function fixNulls() {
    const client = await pool.connect();
    try {
        // Verificar nulos en nuevos turnos (ET1-ET50 aprox)
        const res = await client.query(`
            SELECT id, turno, paciente, consultorio, prioridad, estado
            FROM esq_emergencia.reporte_emergencia
            WHERE turno LIKE 'ET%' 
            AND CAST(SUBSTRING(turno FROM 3) AS INTEGER) BETWEEN 1 AND 50
            ORDER BY turno
        `);
        
        console.log('Registros con nulos:');
        for (const row of res.rows) {
            if (!row.paciente || !row.consultorio) {
                console.log('  ID:', row.id, 'Turno:', row.turno, 'Paciente:', row.paciente, 'Consultorio:', row.consultorio, 'Prioridad:', row.prioridad);
            }
        }
        
        // Actualizar los que tienen nulos
        const consultorios = ['Consultorio 1','Consultorio 2','Consultorio 3','Consultorio 4','Consultorio 5','Ginecología','Pediatría','Medicina Interna','Emergencia','Nutricionista','Cirugía General','Cardiología','Neurología','Traumatología','Dermatología'];
        const medicos = ['ALCAZAR MARCILLO LEONEL SIMON','DELVALLE CALDERON GINGER VERONICA','MACIAS NIEMES GABRIEL FERNANDO','GARCIA MACIAS KAREN JANINA','CAÑARTE TOALA SAID AARON','SANCHEZ CANDELARIO FELIX GUILLERMO','PONCE GOMEZ STEFANY MARIELENA','GUAMAN CASTELO ERIKA MAGALY','MENDOZA SORNOZA HILDA MONSERRATE','LINO ORDOÑEZ JUAN CARLOS'];
        
        for (const row of res.rows) {
            if (!row.paciente || !row.consultorio) {
                await client.query(`
                    UPDATE esq_emergencia.reporte_emergencia 
                    SET paciente = COALESCE(paciente, 'Paciente Sin Identificar'),
                        consultorio = COALESCE(consultorio, $1)
                    WHERE id = $2
                `, [consultorios[Math.floor(Math.random()*15)], row.id]);
                console.log('✅ Actualizado:', row.turno, '- Consultorio asignado');
            }
        }
        console.log('✅ Corrección completada');
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        client.release();
        await pool.end();
    }
}

fixNulls();