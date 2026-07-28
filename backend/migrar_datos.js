const { Client } = require('pg');

async function run() {
  // 1. Connect to postgres database to check and create hospital_prueba database
  const pgClient = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    port: 5432,
  });

  try {
    await pgClient.connect();
    console.log('Connected to local postgres database.');

    // Check if hospital_prueba exists
    const dbRes = await pgClient.query("SELECT 1 FROM pg_database WHERE datname = 'hospital_prueba'");
    if (dbRes.rows.length === 0) {
      console.log('Creating database hospital_prueba...');
      await pgClient.query('CREATE DATABASE hospital_prueba');
      console.log('Database hospital_prueba created successfully.');
    } else {
      console.log('Database hospital_prueba already exists.');
    }
  } catch (err) {
    console.error('Error checking/creating database:', err.message);
    process.exit(1);
  } finally {
    await pgClient.end();
  }

  // 2. Connect to hospital_prueba and set up the schema and table
  const targetClient = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'hospital_prueba',
    port: 5432,
  });

  // Connect to estudiantes database to read data
  const sourceClient = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'estudiantes',
    port: 5432,
  });

  try {
    await targetClient.connect();
    console.log('Connected to target database hospital_prueba.');
    await sourceClient.connect();
    console.log('Connected to source database estudiantes.');

    // Create schema esq_emergencia
    await targetClient.query('CREATE SCHEMA IF NOT EXISTS esq_emergencia');
    console.log('Schema esq_emergencia created or exists.');

    // Drop table if exists to start fresh and avoid duplicates
    await targetClient.query('DROP TABLE IF EXISTS esq_emergencia.reporte_emergencia CASCADE');
    console.log('Cleaned old target table.');

    // Create base table reporte_emergencia
    await targetClient.query(`
      CREATE TABLE esq_emergencia.reporte_emergencia (
        id SERIAL PRIMARY KEY,
        numero integer,
        turno varchar(50),
        paciente varchar(200),
        fecha_turno timestamp,
        fecha_llamado timestamp,
        fecha_sig_vitales timestamp,
        resp_sig_vitales varchar(200),
        fecha_triage timestamp,
        resp_triage varchar(200),
        prioridad varchar(50),
        atendido boolean,
        tiempo_espera_turno_signos varchar(50),
        tiempo_duracion_signos_vitales varchar(50),
        tiempo_espera_signos_triage varchar(50),
        tiempo_duracion_triage varchar(50),
        tiempo_total_turno_triage varchar(50)
      )
    `);
    console.log('Table esq_emergencia.reporte_emergencia created.');

    // Fetch data from estudiantes.public.turnos_diarios_emergencia
    console.log('Fetching data from estudiantes.public.turnos_diarios_emergencia...');
    const dataRes = await sourceClient.query('SELECT * FROM public.turnos_diarios_emergencia ORDER BY "N°" ASC');
    console.log(`Fetched ${dataRes.rows.length} rows.`);

    // Insert rows into target table
    let insertedCount = 0;
    for (let row of dataRes.rows) {
      const numero = row['N°'];
      const turno = row['turno'];
      const paciente = row['paciente'];
      const fecha_turno = row['FECHA TURNO'];
      const fecha_llamado = row['FECHA LLAMADO'];
      const fecha_sig_vitales = row['FECHA SIG.VITALES'];
      const resp_sig_vitales = row['RESP SIG.VITALES'];
      const fecha_triage = row['FECHA TRAIGE']; // Notice spelling TRAIGE in source
      const resp_triage = row['RESP TRAIGE'];     // Notice spelling TRAIGE in source
      
      const atendido = fecha_triage ? true : false;
      
      // Determine priority based on index (insertedCount + 1)
      let prioridad = 'SIN CLASIFICAR';
      if (fecha_triage) {
        const idSimulated = insertedCount + 1;
        if (idSimulated % 20 === 0) {
          prioridad = 'ROJO';
        } else if (idSimulated % 4 === 0) {
          prioridad = 'AMARILLO';
        } else {
          prioridad = 'VERDE';
        }
      }

      const tiempo_espera_turno_signos = row['TIEMPO ESPERA TURNO A SIGNOS'] || '';
      const tiempo_duracion_signos_vitales = row['TIEMPO DURACION SIGNOS VITALES'] || '';
      const tiempo_espera_signos_triage = row['TIEMPO ESPERA SIGNOS A LLAMADO TRIAGE'] || '';
      const tiempo_duracion_triage = row['TIEMPO DURACION TRIAGE'] || '';
      const tiempo_total_turno_triage = row['TIEMPO TOTAL TURNO A TRIAGE'] || '';

      await targetClient.query(`
        INSERT INTO esq_emergencia.reporte_emergencia (
          numero, turno, paciente, fecha_turno, fecha_llamado, fecha_sig_vitales,
          resp_sig_vitales, fecha_triage, resp_triage, prioridad, atendido,
          tiempo_espera_turno_signos, tiempo_duracion_signos_vitales,
          tiempo_espera_signos_triage, tiempo_duracion_triage, tiempo_total_turno_triage
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `, [
        numero, turno, paciente, fecha_turno, fecha_llamado, fecha_sig_vitales,
        resp_sig_vitales, fecha_triage, resp_triage, prioridad, atendido,
        tiempo_espera_turno_signos, tiempo_duracion_signos_vitales,
        tiempo_espera_signos_triage, tiempo_duracion_triage, tiempo_total_turno_triage
      ]);
      insertedCount++;
    }

    console.log(`Successfully migrated ${insertedCount} rows into hospital_prueba.`);

  } catch (err) {
    console.error('Error during data migration:', err.message);
    process.exit(1);
  } finally {
    await targetClient.end();
    await sourceClient.end();
  }
}

run();
