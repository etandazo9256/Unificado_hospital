const { Pool } = require('pg');

// Generate valid Ecuadorian cedula (10 digits with check digit)
function generarCedula() {
  const prov = String(Math.floor(Math.random() * 20) + 1).padStart(2, '0');
  const body = prov + String(Math.floor(Math.random() * 1000000) + 100000).slice(0, 7);
  const digits = body.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = digits[i] * (i % 2 === 0 ? 2 : 1);
    if (v > 9) v -= 9;
    sum += v;
  }
  const check = (10 - (sum % 10)) % 10;
  return body + check;
}

const pool = new Pool({
  host: 'localhost', port: 5432, user: 'postgres',
  password: '2637278910', database: 'hospital_prueba'
});

const prioridades = ['ROJO', 'NARANJA', 'AMARILLO', 'VERDE', 'AZUL'];
const especialidades = ['Emergencia', 'Pediatría', 'Cirugía General', 'Ginecología', 'Medicina Interna', 'Nutricionista', 'Traumatología', 'Cardiología', 'Neurología', 'Dermatología'];
const nombres = [
  'María Fernanda Gómez', 'Carlos Andrés Medina', 'Ana Lucía Pérez', 'Pedro José Sánchez',
  'Sofía Valentina Rojas', 'Diego Alejandro Torres', 'Laura Camila Herrera', 'Andrés Felipe Castro',
  'Valentina Isabel Vargas', 'Juan Esteban Mendoza', 'Gabriela Alexandra Ortiz', 'Luis Miguel Castillo',
  'Camila Andrea Jiménez', 'José Daniel Rivera', 'Isabella Cristina Morales', 'Mateo Sebastián Delgado',
  'Daniela Alejandra Paredes', 'Santiago Andrés Flores', 'María José Narváez', 'David Alejandro Salazar',
  'Paola Nathaly Cárdenas', 'Jorge Luis Montero', 'Carolina Elizabeth Ochoa', 'Felipe Santiago Aguilar',
  'Andrea Carolina Bravo', 'Ricardo Andrés Pacheco', 'Valeria Michelle Rivas', 'Christian Geovanny Paz',
  'Mónica Patricia Suárez', 'Kevin Alexander Ramos', 'Diana Carolina Vera', 'Bryan Steven Molina',
  'Ruth Elizabeth Ibarra', 'Henry Patricio Espinoza', 'Jessica Paola Jiménez', 'Pablo Andrés Vega'
];

async function main() {
  const result = await pool.query("SELECT MAX(turno) as max_turno FROM esq_emergencia.reporte_emergencia");
  const start = parseInt(result.rows[0].max_turno.replace('ET', '')) + 1;
  const count = 25;

  // Ensure some recent fecha_turno so Erlang C works well
  const now = new Date();
  const values = [];
  const params = [];
  let idx = 1;

  for (let i = 0; i < count; i++) {
    const num = start + i;
    const turno = 'ET' + num;
    const paciente = generarCedula();
    const nombre = nombres[i % nombres.length];
    const prioridad = prioridades[Math.floor(Math.random() * prioridades.length)];
    const especialidad = especialidades[Math.floor(Math.random() * especialidades.length)];
    // Random time within last 2 hours so they appear recent
    const minutosAtras = Math.floor(Math.random() * 120);
    const fecha = new Date(now - minutosAtras * 60000).toISOString();

    values.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6})`);
    params.push(turno, paciente, nombre, prioridad, 'pendiente', especialidad, fecha);
    idx += 7;
  }

  const sql = `INSERT INTO esq_emergencia.reporte_emergencia (turno, paciente, medico_responsable, prioridad, estado, consultorio, fecha_turno) VALUES ${values.join(', ')}`;
  await pool.query(sql, params);
  console.log('Insertados ' + count + ' pacientes (ET' + start + ' a ET' + (start + count - 1) + ')');
  pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
