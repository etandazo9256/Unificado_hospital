const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: '2637278910', database: 'hospital_prueba' });

async function main() {
  const r = await pool.query("SELECT COUNT(DISTINCT consultorio) as c FROM esq_emergencia.reporte_emergencia WHERE estado IN ('pendiente_medico','en_atencion_medica') AND consultorio IS NOT NULL AND consultorio != ''");
  console.log('Consultorios activos actuales:', r.rows[0].c);

  await pool.query(`
    INSERT INTO esq_emergencia.reporte_emergencia 
    (turno, paciente, prioridad, estado, consultorio, medico_responsable, fecha_inicio_atencion_medica)
    SELECT 'MED'||gs, '123456789'||gs, 'VERDE', 'en_atencion_medica', 
           'Consultorio '||(gs+4), 'Dr. Test '||gs, NOW()
    FROM generate_series(1,6) gs
  `);
  console.log('Insertados 6 médicos más');
  pool.end();
}
main().catch(e => { console.error(e); pool.end(); });