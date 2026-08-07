require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.DB_HOST,
    port: 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

function generarCedula() {
    const provincia = String(Math.floor(Math.random() * 24) + 1).padStart(2, '0');
    let digitos = provincia;
    for (let i = 0; i < 8; i++) {
        digitos += Math.floor(Math.random() * 10);
    }
    return digitos;
}

const areas = [
    'Cardiología', 'Pediatría', 'Ginecología', 'Medicina Interna', 'Emergencia',
    'Cirugía General', 'Traumatología', 'Dermatología', 'Neurología', 'Nutricionista'
];

function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
    const client = await pool.connect();
    try {
        const ultimoTurno = await client.query(
            `SELECT MAX(turno) as max_turno FROM esq_emergencia.reporte_emergencia WHERE turno LIKE 'ET%'`
        );
        let ultimoNum = 280;
        if (ultimoTurno.rows[0].max_turno) {
            const m = ultimoTurno.rows[0].max_turno.match(/ET(\d+)/);
            if (m) ultimoNum = Math.max(ultimoNum, parseInt(m[1]));
        }

        const lastIdResult = await client.query('SELECT MAX(id) as max_id FROM esq_emergencia.reporte_emergencia');
        let nextId = (lastIdResult.rows[0].max_id || 0) + 1;
        const lastNumResult = await client.query('SELECT MAX(numero) as max_num FROM esq_emergencia.reporte_emergencia');
        let nextNum = (lastNumResult.rows[0].max_num || 0) + 1;

        const count = 5;
        console.log(`Insertando ${count} turnos prioritarios ROJO desde ET${ultimoNum + 1}...`);

        for (let i = 0; i < count; i++) {
            const numTurno = ultimoNum + 1 + i;
            const turno = `ET${numTurno}`;
            const cedula = generarCedula();
            const area = getRandom(areas);

            const fechaTurno = new Date();
            fechaTurno.setMinutes(fechaTurno.getMinutes() + i * 5);

            const query = `
                INSERT INTO esq_emergencia.reporte_emergencia (
                    id, numero, turno, paciente, prioridad, estado,
                    consultorio, fecha_turno, atendido
                ) VALUES ($1, $2, $3, $4, 'P1-RESUCITACION', 'pendiente', $5, $6, false)
            `;
            const values = [nextId++, nextNum++, turno, cedula, area, fechaTurno.toISOString().replace('T', ' ').slice(0, 19)];

            await client.query(query, values);
            console.log(`  ${turno} | cédula: ${cedula.slice(0, 3)}xxxxx${cedula.slice(-2)} | área: ${area} | prioridad: P1-RESUCITACION`);
        }

        console.log(`✅ ${count} turnos ROJO insertados exitosamente`);
        console.log(`Último turno: ET${ultimoNum + count}`);
    } catch (error) {
        console.error('❌ Error insertando turnos ROJO:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
