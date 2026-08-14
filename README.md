# 🏥 HEP Dashboard — Hospital de Especialidades Portoviejo

**Dashboard de Indicadores Clave de Rendimiento (KPI) para el Área de Emergencia**

Sistema web para la gestión de turnos y visualización de indicadores hospitalarios del Departamento de Emergencia del Hospital de Especialidades Portoviejo, Ecuador.

---

## 📋 Descripción del Proyecto

Este proyecto consta de **tres pantallas principales**:

### 1. Sistema de Gestión de Turnos — `frontend/index.html`
Pantalla operativa para la administración en tiempo real de la cola de atención de pacientes en el área de emergencia.

- Visualización del turno en atención actual.
- Lista de próximos turnos pendientes con su prioridad Manchester.
- Botones de acción: Siguiente turno, Llamar y Reiniciar sistema.
- Estadísticas en vivo: pendientes, atendidos, total y tiempo de espera promedio.
- Actualización en tiempo real (estado de la sala) mediante Socket.IO.
- Reloj en tiempo real y atajos de teclado.

### 2. Dashboard de KPIs de Emergencia — `frontend/dashboard/dashboard.html`
Panel analítico y administrativo para directores, jefes de servicio y analistas de calidad hospitalaria.

- **Tarjetas de KPI**: Total de pacientes atendidos, pendientes y tiempo promedio total de atención (en minutos).
- **Gráfico de Demanda por Hora**: Distribución de admisiones por hora del día para identificar horas pico.
- **Gráfico de Prioridades de Triage**: Distribución por gravedad (Rojo, Naranja, Amarillo, Verde, Azul).
- **Gráfico de Tiempos por Etapa**: Comparación de tiempos promedio en cada fase del proceso (espera de signos, toma de signos, espera de triage, evaluación de triage y tiempo total).
- **Gráfico de Evolución Diaria**: Tendencia de admisiones por fecha con correlación de tiempos de respuesta.
- **Tablas de Productividad**: Top 5 del personal de enfermería (signos vitales) y médicos (triage) con barras de progreso visual.
- **Filtro por Rango de Fechas**: Permite acotar los indicadores a un período específico.
- **Exportación a Excel y PDF**: Descarga de reportes con el logo del hospital integrado.

### 3. Pantalla de Espera — `frontend/espera.html`
Pantalla informativa para los pacientes en espera de su turno.

- **Tiempo estimado de espera** por clasificación Manchester (Rojo, Naranja, Amarillo, Verde, Azul), calculado según el último turno en cola de cada prioridad.
- **Turno en atención actual** y próximos turnos.
- Panel de video institucional.
- Reloj en tiempo real.
- Actualización en tiempo real (Socket.IO) con respaldo cada 15 segundos.

---

## 🛠️ Tecnologías Utilizadas

| Componente      | Tecnología                                      |
|-----------------|--------------------------------------------------|
| **Backend**     | Node.js + Express.js                             |
| **Base de Datos** | PostgreSQL (esquema `esq_emergencia`)           |
| **Frontend**    | HTML5, CSS3 (vanilla), JavaScript (vanilla)      |
| **Gráficos**    | Chart.js (CDN)                                   |
| **Tipografía**  | Google Fonts — Outfit                            |
| **Control de Versiones** | Git + GitHub                            |

---

## 📁 Estructura del Proyecto

```
sistema_turno/
├── backend/
│   ├── db.js                  # Conexión a PostgreSQL (Supabase) con reconexión automática
│   ├── server.js              # Servidor Express + Socket.IO (turnos, sala y KPIs)
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── index.html             # Pantalla del sistema de gestión de turnos
│   ├── app.js                 # Lógica del sistema de turnos
│   ├── style.css              # Estilos del sistema de turnos
│   ├── shared.css             # Estilos compartidos
│   ├── sound.js               # Sonidos de notificación
│   ├── espera.html            # Pantalla de espera para pacientes
│   ├── espera.js              # Lógica de la pantalla de espera (Socket.IO)
│   ├── espera.css             # Estilos de la pantalla de espera
│   ├── video2.mp4 - video5.mp4# Videos institucionales (panel de espera)
│   ├── logo-hospital.png      # Logo del hospital
│   └── dashboard/
│       ├── dashboard.html     # Dashboard de indicadores KPI
│       ├── dashboard.js       # Lógica del dashboard (Chart.js + API)
│       ├── dashboard-exports.js # Exportación a Excel y PDF
│       ├── dashboard.css      # Estilos del dashboard
│       └── logo-hospital.png  # Logo del hospital (dashboard)
│
├── database/
│   ├── schema.sql             # Esquema de la base de datos (tabla, secuencia, índices)
│   └── seed.sql               # Datos de ejemplo para probar el sistema
│
├── .gitignore
└── README.md
```

---

## ⚙️ Requisitos Previos

- **Node.js** v18 o superior
- **PostgreSQL** v14 o superior (el proyecto está configurado para **Supabase** con esquema `esq_emergencia` y tabla `reporte_emergencia`)

---

## 🚀 Instalación y Ejecución

### 1. Clonar el repositorio

```bash
git clone https://github.com/etandazo9256/hep_dashboard.git
cd hep_dashboard
```

### 2. Instalar dependencias del backend

```bash
cd backend
npm install
```

### 3. Configurar la conexión a PostgreSQL

Crear el archivo `backend/.env` con las credenciales de Supabase:

```
DB_HOST=TU-PROYECTO.pooler.supabase.com
DB_PORT=5432
DB_USER=postgres.TU-PROYECTO
DB_PASSWORD=TU_CLAVE
DB_NAME=postgres
```

> Si se usa una base local (`localhost` o `127.0.0.1`), el SSL se desactiva automáticamente.

### 4. Iniciar el servidor backend

```bash
npm start
```

El servidor se ejecutará en `http://localhost:3000`.

### 5. Abrir las pantallas

Abrir en el navegador:

- **Sistema de Turnos**: `http://localhost:3000/frontend/index.html`
- **Dashboard KPI**: `http://localhost:3000/frontend/dashboard/dashboard.html`
- **Pantalla de Espera**: `http://localhost:3000/frontend/espera.html`

---

## 📡 Endpoints de la API

### Gestión de Turnos

| Método | Endpoint                    | Descripción                          |
|--------|-----------------------------|--------------------------------------|
| GET    | `/api/turnos`               | Obtener todos los turnos (últimos 50)|
| GET    | `/api/turnos/pendientes`    | Obtener turnos pendientes            |
| GET    | `/api/turnos/actual`        | Obtener turno actual en atención     |
| POST   | `/api/turnos/siguiente`     | Avanzar al siguiente turno           |
| POST   | `/api/turnos/reiniciar`     | Reiniciar el sistema de turnos       |

### Dashboard de KPIs

| Método | Endpoint                       | Descripción                                        |
|--------|--------------------------------|----------------------------------------------------|
| GET    | `/api/kpis/resumen`            | Métricas generales (totales y promedios)           |
| GET    | `/api/kpis/prioridad`          | Distribución por prioridad de triage               |
| GET    | `/api/kpis/productividad`      | Top 5 personal en signos vitales y triage          |
| GET    | `/api/kpis/tendencia-hora`     | Admisiones agrupadas por hora del día              |
| GET    | `/api/kpis/tendencia-fecha`    | Tendencia diaria de admisiones y tiempos           |

> **Filtros disponibles**: Todos los endpoints de KPI aceptan los parámetros opcionales `?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD` para acotar los resultados a un período específico.

---

## 🗄️ Esquema de Base de Datos

El proyecto incluye los scripts de base de datos en la carpeta `database/`:

| Archivo        | Contenido                                                        |
|----------------|------------------------------------------------------------------|
| `schema.sql`   | Esquema completo: tabla, secuencia, restricciones e índices      |
| `seed.sql`     | Datos de ejemplo (turnos) para probar el sistema                 |

**Tabla principal**: `esq_emergencia.reporte_emergencia`

| Columna                         | Tipo          | Descripción                                  |
|---------------------------------|---------------|----------------------------------------------|
| `id`                            | integer       | Identificador único (secuencia `reporte_emergencia_id_seq`) |
| `numero`                        | integer       | Número secuencial del turno                  |
| `turno`                         | varchar       | Código del turno (ej: ET1, ET202)            |
| `paciente`                      | varchar       | Nombre o documento del paciente              |
| `fecha_turno`                   | timestamp     | Fecha y hora de emisión del turno            |
| `fecha_llamado`                 | timestamp     | Fecha y hora del llamado al paciente         |
| `fecha_sig_vitales`             | timestamp     | Fecha y hora de toma de signos vitales       |
| `resp_sig_vitales`              | varchar       | Profesional que tomó signos vitales          |
| `fecha_triage`                  | timestamp     | Fecha y hora de evaluación de triage         |
| `resp_triage`                   | varchar       | Médico responsable del triage                |
| `prioridad`                     | varchar       | Prioridad Manchester (ROJO/NARANJA/AMARILLO/VERDE/AZUL) |
| `estado`                        | varchar       | Estado del turno (`pendiente`, `llamado`, `en_triage`, `pendiente_medico`, `en_atencion_medica`, `finalizado`, `no_asiste`, `cancelado`) |
| `atendido`                      | boolean       | Indica si el turno fue atendido              |
| `medico_responsable`            | varchar       | Médico responsable de la atención médica     |
| `consultorio`                   | varchar       | Consultorio o especialidad asignada          |
| `tiempo_*`                      | varchar       | Tiempos por etapa del flujo (HH:MM:SS)       |
| `fecha_inicio_triage` / `fecha_fin_triage` | timestamp | Inicio y fin del triage              |
| `fecha_inicio_atencion_medica` / `fecha_fin_atencion_medica` | timestamp | Inicio y fin de la atención médica |
| `observacion_estado`            | text          | Nota/observación de cambio de estado (causa de cancelación, etc.) |

> **Nota**: La columna `id` usa la secuencia `esq_emergencia.reporte_emergencia_id_seq`. El esquema incluye un `CHECK` que valida los estados válidos y varios índices para las consultas frecuentes (por fecha, estado y atención).

### 📥 Cómo importar el esquema y los datos

El orden siempre es: **1)** ejecutar `schema.sql` (estructura) y **2)** ejecutar `seed.sql` (datos).

#### Opción A — Supabase (SQL Editor)

1. Abrir la consola de Supabase → **SQL Editor** → **New query**.
2. Copiar el contenido de `database/schema.sql`, pegarlo y ejecutar (▶ Run).
3. Repetir con `database/seed.sql`.

#### Opción B — Terminal con `psql`

```bash
# 1. Crear el esquema y la tabla
psql "$DATABASE_URL" -f database/schema.sql

# 2. Cargar los datos de ejemplo
psql "$DATABASE_URL" -f database/seed.sql
```

#### Opción C — pgAdmin

1. Conectar al servidor y abrir la base de datos donde se importará (ej: `hospital_prueba`).
2. Abrir **Query Tool** (clic derecho sobre la base → *Query Tool*).
3. Cargar el archivo: **File → Open** (ícono de carpeta) → seleccionar `database/schema.sql`.
4. Ejecutar con **F5** (o el botón ▶).
5. Repetir los pasos 3–4 con `database/seed.sql`.

> Si ya existe el esquema/tabla, `schema.sql` no falla (usa `IF NOT EXISTS`); pero el `seed.sql` duplicará los registros, por lo que solo debes ejecutarlo una vez o sobre una base limpia.

#### Opción D — DBeaver

1. Conectar al servidor y abrir la base de datos destino.
2. Abrir el **SQL Editor**: clic derecho sobre la base → **SQL Editor → Open SQL Editor** (o tool `Alt+X`).
3. Abrir el archivo: **File → Open File** → seleccionar `database/schema.sql`.
4. Ejecutar con **Ctrl+Enter** (o clic en ▶).
5. Repetir los pasos 3–4 con `database/seed.sql`.

> Si la conexión muestra credenciales, recordar que al importar en pgAdmin/DBeaver solo se necesita apuntar a la misma base y esquema `esq_emergencia`.

---

## 👤 Autor

- **Repositorio**: [etandazo9256/hep_dashboard](https://github.com/etandazo9256/hep_dashboard)

---

## 📄 Licencia

Este proyecto es de uso interno del Hospital de Especialidades Portoviejo.
