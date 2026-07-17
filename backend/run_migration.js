const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'hospital_prueba',
    port: 5432,
  });

  try {
    await client.connect();
    console.log('Connected to hospital_prueba database.');

    const sqlPath = path.join(__dirname, '..', 'database', 'migrations', '001_flujo_turnos_emergencia.sql');
    console.log('Reading migration file:', sqlPath);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Executing migration SQL...');
    await client.query(sql);
    console.log('Migration executed successfully!');

  } catch (err) {
    console.error('Error running migration:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
