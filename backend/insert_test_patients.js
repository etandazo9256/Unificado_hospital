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

const prioridades = ['ROJO', 'NARANJA', 'AMARILLO', 'VERDE', 'AZUL'];
const consultorios = [
    'Consultorio 1', 'Consultorio 2', 'Consultorio 3', 'Consultorio 4', 'Consultorio 5', 
    'Ginecología', 'Pediatría', 'Medicina Interna', 'Emergencia', 'Nutricionista', 
    'Cirugía General', 'Cardiología', 'Neurología', 'Traumatología', 'Dermatología'
];
const medicos = [
    'ALCAZAR MARCILLO LEONEL SIMON',
    'DELVALLE CALDERON GINGER VERONICA',
    'MACIAS NIEMES GABRIEL FERNANDO',
    'GARCIA MACIAS KAREN JANINA',
    'CAÑARTE TOALA SAID AARON',
    'SANCHEZ CANDELARIO FELIX GUILLERMO',
    'PONCE GOMEZ STEFANY MARIELENA',
    'GUAMAN CASTELO ERIKA MAGALY',
    'MENDOZA SORNOZA HILDA MONSERRATE',
    'LINO ORDOÑEZ JUAN CARLOS',
    'BASURTO ZAMBRANO GEMA MARIA',
    'SALTOS INTRIAGO GEMA ALEXANDRA',
    'CEDEÑO VILLAPRADO KARLA XIMENA',
    'FIENCO LOPEZ GUILLERMO HOPALON',
    'CENTENO RIZO CLAUDIA MARIA',
    'VERA ZAMORA LUIS JAVIER',
    'MOREIRA CASTILLO MELANNIE DAYIRETH',
    'GUERRA JAIME BRYAN ANTHONY',
    'TRIVIÑO VERA BRENDA NARCISA',
    'ALCIVAR SORNOZA LOURDES MARIBEL'
];
const apellidos = ['GARCÍA', 'RODRÍGUEZ', 'GONZÁLEZ', 'FERNÁNDEZ', 'LÓPEZ', 'MARTÍNEZ', 'SÁNCHEZ', 'PÉREZ', 'GÓMEZ', 'MARTÍN', 'JIMÉNEZ', 'RUIZ', 'HERNÁNDEZ', 'DÍAZ', 'MORENO', 'ÁLVAREZ', 'ROMERO', 'ALONSO', 'GUTIÉRREZ', 'NAVARRO', 'TORRES', 'DOMÍNGUEZ', 'VÁZQUEZ', 'RAMOS', 'GIL', 'RAMÍREZ', 'SERRANO', 'BLANCO', 'MOLINA', 'MORALES', 'SUÁREZ', 'ORTIZ', 'DELGADO', 'CASTRO', 'ORTÍZ', 'RUBIO', 'MARÍN', 'SANZ', 'IGLESIAS', 'MEDINA', 'GARRIDO', 'CORTÉS', 'CASTILLO', 'SANTOS', 'LOZANO', 'GUERRERO', 'CANO', 'PRIETO', 'MÉNDEZ', 'CALVO', 'DOMINGO', 'HERRERA', 'MOLINA', 'ROJAS', 'HERRERO'];
const nombres = ['MARÍA', 'JOSÉ', 'ANTONIO', 'JUAN', 'FRANCISCO', 'CARLOS', 'JESÚS', 'MANUEL', 'LUIS', 'ALEJANDRO', 'MIGUEL', 'PEDRO', 'PABLO', 'ÁNGEL', 'SERGIO', 'DANIEL', 'ADRIÁN', 'RAFAEL', 'DAVID', 'JAVIER', 'FERNANDO', 'IVÁN', 'ALBERTO', 'DIEGO', 'RUBÉN', 'ÓSCAR', 'MARCOS', 'JUAN CARLOS', 'JUAN JOSÉ', 'JOSÉ LUIS', 'JOSÉ ANTONIO', 'FRANCISCO JAVIER', 'JOSÉ MANUEL', 'JUAN ANTONIO', 'LUIS MIGUEL', 'MIGUEL ÁNGEL', 'JUAN MANUEL', 'ANTONIO JOSÉ', 'JOSÉ MIGUEL', 'JUAN FRANCISCO', 'MANUEL JESÚS', 'JESÚS MARÍA', 'JUAN LUIS', 'FRANCISCO JOSÉ', 'JUAN JOSÉ', 'LUIS FERNANDO', 'JUAN CARLOS', 'JUAN ANTONIO', 'JOSÉ LUIS', 'ANTONIO', 'JUAN MANUEL', 'MANUEL', 'JUAN', 'JOSÉ', 'FRANCISCO', 'CARLOS', 'LUIS', 'ALEJANDRO', 'MIGUEL', 'PEDRO', 'PABLO', 'ÁNGEL', 'SERGIO', 'DANIEL', 'RAFAEL', 'DAVID', 'JAVIER', 'FERNANDO', 'IVÁN', 'ALBERTO', 'DIEGO', 'RUBÉN', 'ÓSCAR', 'MARCOS'];

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function formatDateForSQL(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Generar cédula ecuatoriana válida (10 dígitos) y formato parcial tipo 135xxxxx9256
function generateCedulaParcial() {
    const provincia = Math.floor(Math.random() * 24) + 1;
    let digitos = provincia.toString().padStart(2, '0');
    for (let i = 0; i < 8; i++) {
        digitos += Math.floor(Math.random() * 10);
    }
    // Formato: primeros 3 dígitos + xxxxx + últimos 4 dígitos
    // ej: 135xxxxx9256
    return digitos.substring(0, 3) + 'xxxxx' + digitos.substring(6, 10);
}

function generateCedulaCompleta() {
    const provincia = Math.floor(Math.random() * 24) + 1;
    let digitos = provincia.toString().padStart(2, '0');
    for (let i = 0; i < 8; i++) {
        digitos += Math.floor(Math.random() * 10);
    }
    return digitos;
}

function formatTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const s = Math.floor(Math.random() * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDateForSQL(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function insertTestPatients(count = 50) {
    const client = await pool.connect();
    
    try {
        console.log(`Insertando ${count} pacientes de prueba...`);
        
        // Obtener el último ID usado
        const lastIdResult = await client.query('SELECT MAX(id) as max_id FROM esq_emergencia.reporte_emergencia');
        let nextId = (lastIdResult.rows[0].max_id || 0) + 1;
        
        // Obtener el último número de turno
        const lastNumResult = await client.query('SELECT MAX(numero) as max_num FROM esq_emergencia.reporte_emergencia');
        let nextNum = (lastNumResult.rows[0].max_num || 0) + 1;
        
        // Obtener el último turno (continuar desde ET271)
        const lastTurnoResult = await client.query('SELECT MAX(turno) as max_turno FROM esq_emergencia.reporte_emergencia');
        let lastTurnoNum = 0;
        if (lastTurnoResult.rows[0].max_turno) {
            const match = lastTurnoResult.rows[0].max_turno.match(/ET(\d+)/);
            if (match) lastTurnoNum = parseInt(match[1]);
        }
        
        console.log(`Continuando desde ID: ${nextId}, Número: ${nextNum}, Turno: ET${lastTurnoNum + 1}`);
        
        for (let i = 0; i < count; i++) {
            const id = nextId++;
            const numero = nextNum++;
            const turnoNum = lastTurnoNum + i + 1;
            const turno = `ET${turnoNum}`;
            const cedulaCompleta = generateCedulaCompleta(); // Para BD
            const cedulaParcial = generateCedulaParcial(); // Para mostrar 135xxxxx9256
            const prioridad = getRandomElement(prioridades);
            const estado = Math.random() > 0.7 ? 'finalizado' : (Math.random() > 0.5 ? 'pendiente' : (Math.random() > 0.5 ? 'en_triage' : 'llamado'));
            const atendido = estado === 'finalizado';
            
            // Generar fechas
            const baseDate = new Date('2026-08-05');
            const fechaTurno = new Date(baseDate);
            fechaTurno.setHours(Math.floor(Math.random() * 12) + 7); // 7am - 7pm
            fechaTurno.setMinutes(Math.floor(Math.random() * 60));
            fechaTurno.setSeconds(Math.floor(Math.random() * 60));
            
            const fechaLlamado = estado !== 'pendiente' ? new Date(fechaTurno.getTime() + Math.random() * 30 * 60000) : null;
            const fechaSigVitales = fechaLlamado ? new Date(fechaLlamado.getTime() + Math.random() * 15 * 60000) : null;
            const fechaTriage = fechaSigVitales ? new Date(fechaSigVitales.getTime() + Math.random() * 20 * 60000) : null;
            
            const medicoResponsable = (estado === 'finalizado' || estado === 'en_triage' || estado === 'llamado') ? getRandomElement(medicos) : null;
            const consultorio = estado !== 'pendiente' ? getRandomElement(consultorios) : null;
            
            // Generar nombre del paciente
            const apellido1 = getRandomElement(apellidos);
            const apellido2 = getRandomElement(apellidos);
            const nombre = getRandomElement(nombres);
            const segundoNombre = Math.random() > 0.5 ? getRandomElement(nombres) : '';
            const paciente = `${apellido1} ${apellido2} ${nombre}${segundoNombre ? ' ' + segundoNombre : ''}`;
            
            // Tiempos válidos
            const tiempoEspera = Math.floor(Math.random() * 120); // 0-119 min
            const tiempoDuracion = Math.floor(Math.random() * 60);
            const tiempoEsperaTriage = Math.floor(Math.random() * 60);
            const tiempoDuracionTriage = Math.floor(Math.random() * 60);
            const tiempoTotal = Math.floor(Math.random() * 180);
            
const formatTime = (minutes) => {
    // Valid PostgreSQL interval: HH:MM:SS where MM and SS are 0-59
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const s = Math.floor(Math.random() * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
            
            const query = `
                INSERT INTO esq_emergencia.reporte_emergencia (
                    id, numero, fecha_turno, fecha_llamado, fecha_sig_vitales, resp_sig_vitales,
                    fecha_triage, resp_triage, turno, paciente, fecha_ing_observacion,
                    fecha_soli_hosp, fecha_ing_hospitalizacion, tiempo_espera_turno_signos,
                    tiempo_duracion_signos_vitales, tiempo_espera_signos_triage,
                    tiempo_duracion_triage, tiempo_total_turno_triage, prioridad,
                    atendido, estado, fecha_inicio_triage, fecha_fin_triage,
                    fecha_inicio_atencion_medica, fecha_fin_atencion_medica,
                    medico_responsable, consultorio, observacion_estado
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
                )
            `;
            
            const values = [
                id,
                numero,
                formatDateForSQL(fechaTurno),
                fechaLlamado ? formatDateForSQL(fechaLlamado) : null,
                fechaSigVitales ? formatDateForSQL(fechaSigVitales) : null,
                fechaLlamado ? getRandomElement(medicos) : null,
                fechaTriage ? formatDateForSQL(fechaTriage) : null,
                fechaTriage ? getRandomElement(medicos) : null,
                turno,
                paciente,
                null, // fecha_ing_observacion
                null, // fecha_soli_hosp
                null, // fecha_ing_hospitalizacion
                fechaLlamado ? formatTime(tiempoEspera) : null,
                fechaSigVitales && fechaLlamado ? formatTime(Math.floor(Math.random() * 60)) : null,
                fechaTriage && fechaSigVitales ? formatTime(Math.floor(Math.random() * 60)) : null,
                fechaTriage && fechaSigVitales ? formatTime(Math.floor(Math.random() * 60)) : null,
                fechaTriage && fechaTurno ? formatTime(Math.floor(Math.random() * 180)) : null,
                prioridad,
                atendido,
                estado,
                fechaTriage ? formatDateForSQL(new Date(fechaTriage.getTime() - Math.random() * 30 * 60000)) : null,
                fechaTriage ? formatDateForSQL(fechaTriage) : null,
                atendido ? formatDateForSQL(new Date(fechaTriage.getTime() + Math.random() * 60 * 60000)) : null,
                atendido ? formatDateForSQL(new Date(fechaTriage.getTime() + Math.random() * 120 * 60000)) : null,
                medicoResponsable,
                consultorio,
                null
            ];
            
            await client.query(query, values);
            
            if ((i + 1) % 10 === 0) {
                console.log(`Insertados ${i + 1}/${count} pacientes... (último: ${turno}, cédula: ${generateCedulaParcial()})`);
            }
        }
        
        console.log(`✅ ${count} pacientes insertados exitosamente`);
        console.log(`Último turno: ET${lastTurnoNum + count}`);
        
    } catch (error) {
        console.error('❌ Error insertando pacientes:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

insertTestPatients(50);