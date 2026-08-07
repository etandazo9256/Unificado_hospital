const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost', port: 5432, user: 'postgres',
  password: '2637278910', database: 'hospital_prueba'
});

pool.query("SELECT MAX(turno) as max_turno, COUNT(*) as total FROM esq_emergencia.reporte_emergencia WHERE estado = 'pendiente'")
  .then(r => {
    console.log('Max turno:', r.rows[0].max_turno);
    console.log('Total pendientes:', r.rows[0].total);
    pool.end();
  });
