# 🏥 Sistema Unificado de Gestión de Turnos — Área de Emergencia

**Hospital de Especialidades Portoviejo (HEP Dashboard Unificado)**

Sistema web para la gestión de turnos y visualización de indicadores del **Departamento de Emergencia** del Hospital de Especialidades Portoviejo, Ecuador. Unifica en una sola aplicación las tres pantallas del sistema, con un **menú central de acceso** y actualización en **tiempo real** vía Socket.IO.

---

## 🖥️ Pantallas del Sistema (Unificado)

### 0. Menú Central — `frontend/menu.html`

Portada del sistema. Acceso directo a las tres pantallas mediante tarjetas con descripción.

- **Estado del sistema en vivo**: pendientes, en triage, en consulta, atendidos y tiempo promedio (consume la misma API del backend).
- Botón de **pantalla completa** para equipar los monitores.
- Reloj y fecha en tiempo real, indicador de conexión.

Principales rutas (servidas por el backend en `http://localhost:3000`):

| Pantalla | URL |
|---|---|
| **Menú central (portada)** | `http://localhost:3000/` |
| **Sala de Espera** | `http://localhost:3000/frontend/index.html` |
| **Tiempo de Espera Manchester** | `http://localhost:3000/frontend/espera.html` |
| **Dashboard de Indicadores (KPI)** | `http://localhost:3000/frontend/dashboard/dashboard.html` |

### 1. Sala de Espera — `frontend/index.html`

Pantalla de **TV** para mostrar en la sala de espera del área de emergencia.

- Turno en atención actual (con consultorio, prioridad y hora de llamado).
- Próximos turnos en cola con su clasificación Manchester.
- Estadísticas en vivo (pendientes, en triage, en consulta, atendidos, promedio).
- Objetivos y promedios de espera por prioridad Manchester (Rojo / Naranja / Amarillo / Verde / Azul).
- Botón *Volver a llamar* y actualización en tiempo real (Socket.IO) con respaldo por sondeo cada 15 s.

### 2. Tiempo de Espera Manchester — `frontend/espera.html`

Pantalla de **TV** informativa para pacientes.

- Tiempo estimado de espera por cada nivel de clasificación Manchester.
- Panel de video institucional (carrusel de videos).
- Reloj en tiempo real y actualización en tiempo real (Socket.IO).

### 3. Dashboard de Indicadores (KPI) — `frontend/dashboard/dashboard.html`

Panel analítico y administrativo para dirección, jefes de servicio y calidad hospitalaria.

- **Tarjetas KPI**: atendidos, pendientes y tiempo total promedio de atención.
- **Gráficos** (Chart.js): demanda por hora, prioridades de triage, tiempos por etapa del flujo y evolución diaria.
- **Tablas de productividad**: personal destacado en signos vitales y triage.
- **Filtro por rango de fechas** + filtros rápidos (semana, mes, trimestre, año).
- **Actualización en tiempo real**: botón *Actualizar*, *Auto-refresh* cada 30 s y **Socket.IO** que refresca automáticamente ante cualquier evento de turnos (llamado, triage, atención, finalización).
- **Exportación a Excel y PDF** con logo del hospital.

Las pantallas de *Sala de Espera* y *Tiempo de Espera Manchester* están diseñadas en formato **16:9** para montarse en **pantallas/TV independientes** (una pestaña/distinto monitor por pantalla).

---

## 🛠️ Tecnologías Utilizadas

| Componente | Tecnología |
|---|---|
| **Backend** | Node.js + Express.js + Socket.IO |
| **Base de Datos** | PostgreSQL (esquema `esq_emergencia`) |
| **Frontend** | HTML5, CSS3 y JavaScript (vanilla) |
| **Gráficos** | Chart.js (CDN) |
| **Exportación** | ExcelJS (Excel) · jsPDF + html2canvas (PDF) |
| **Tipografía** | Google Fonts — Outfit |
| **Control de Versiones** | Git + GitHub |

---

## 📁 Estructura del Proyecto

```
Unificado_hospital/
├── backend/
│   ├── db.js                    # Conexión a PostgreSQL con reconexión automática
│   ├── server.js                # Servidor Express + Socket.IO (turnos, sala y KPIs)
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── menu.html                # ⭐ Menú central del sistema unificado
│   ├── menu.css                 # Estilos del menú
│   ├── menu.js                  # Reloj, estado en vivo y pantalla completa
│   ├── index.html               # Pantalla de Sala de Espera
│   ├── app.js                   # Lógica de la sala (Socket.IO)
│   ├── style.css                # Estilos de la sala
│   ├── shared.css               # Estilos compartidos (botón Menú, etc.)
│   ├── espera.html              # Pantalla de Tiempo de Espera Manchester
│   ├── espera.js                # Lógica de la pantalla Manchester
│   ├── espera.css               # Estilos de la pantalla Manchester
│   ├── sound.js                 # Sonidos de notificación
│   ├── video*.mp4               # Videos institucionales (no versionados)
│   ├── logo-hospital.png        # Logo del hospital
│   └── dashboard/
│       ├── dashboard.html       # Dashboard de indicadores KPI
│       ├── dashboard.js         # Lógica del dashboard (Chart.js + Socket.IO)
│       ├── dashboard-exports.js # Exportación a Excel y PDF
│       ├── dashboard.css        # Estilos del dashboard
│       └── logo-hospital.png
│
├── database/
│   ├── schema.sql               # Esquema de la base de datos (tabla, secuencia, índices)
│   └── seed.sql                 # Datos de ejemplo para probar el sistema
│
├── .gitignore
└── README.md
```

---

## 💻 Instalación en otra máquina (paso a paso)

### 1. Requisitos previos

- **Node.js** v18 o superior → [https://nodejs.org](https://nodejs.org) (descargar LTS).
- **Git** → [https://git-scm.com](https://git-scm.com).
- Acceso a la base de datos (opcional si solo se va a *ver* la interfaz: el sistema funciona con supabase o cualquier PostgreSQL).

### 2. Clonar el repositorio

```bash
git clone https://github.com/etandazo9256/Unificado_hospital.git
cd Unificado_hospital
```

### 3. Instalar dependencias del backend

```bash
cd backend
npm install
```

### 4. Configurar la conexión a la base de datos

Crear el archivo **`backend/.env`** (no viene incluido por seguridad) con estas variables:

```
DB_HOST=<host de PostgreSQL>
DB_PORT=5432
DB_USER=<usuario>
DB_PASSWORD=<contraseña>
DB_NAME=<nombre de la base>
```

> Si el host es local (`localhost` / `127.0.0.1`), el SSL se desactiva automáticamente en `db.js`. Para un host remoto con SSL habilitado, funciona sin configuración extra.

### 5. Importar el esquema de la base de datos

Si aún no existe la estructura, ejecutar el script de esquema en la base de datos destino con psql, pgAdmin o DBeaver:

```bash
psql "$CADENA_DE_CONEXION" -f database/schema.sql
# Opcional (datos de ejemplo):
psql "$CADENA_DE_CONEXION" -f database/seed.sql
```

- `schema.sql` crea el esquema `esq_emergencia`, la tabla `reporte_emergencia`, la secuencia, el `CHECK` de estados y los índices (es idempotente: usa `IF NOT EXISTS`).
- `seed.sql` carga datos de ejemplo → ejecutar **una sola vez** y preferentemente sobre una base limpia.

### 6. Iniciar el servidor

Desde la carpeta `backend/`:

```bash
npm start
```

El sistema correrá en **`http://localhost:3000`** y abrirá el **menú central**.

### 7. Abrir las pantallas en los monitores

En cada monitor/TV abierto el navegador en pantalla completa (F11 o el botón ⛶ del menú):

| Monitor | URL |
|---|---|
| TV 1 — Sala de espera | `http://localhost:3000/frontend/index.html` |
| TV 2 — Tiempos Manchester | `http://localhost:3000/frontend/espera.html` |
| PC de dirección | `http://localhost:3000/frontend/dashboard/dashboard.html` |

> **Nota de red:** el resto de máquinas de la red puede acceder al sistema desde la IP del equipo servidor (ej. `http://192.168.1.X:3000`), siempre que el firewall Windows permita el puerto 3000.

---

## 📡 Endpoints de la API

### Gestión de turnos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/turnos/sala` | Estado completo de la sala (turno actual, próximos, stats) |
| GET | `/api/turnos` | Todos los turnos recientes |
| GET | `/api/turnos/pendientes` | Turnos pendientes |
| GET | `/api/turnos/pendientes-triage` | Cola pendiente de triage |
| GET | `/api/turnos/pendientes-medico` | Cola pendiente de médico |
| GET | `/api/turnos/en-atencion-medica` | Turnos en atención médica |
| GET | `/api/turnos/actual` | Turno actual en atención |
| POST | `/api/turnos/:id/llamar` | Llamar a un turno |
| POST | `/api/turnos/:id/rellamar` | Volver a llamar |
| POST | `/api/turnos/:id/iniciar-triage` | Iniciar triage |
| POST | `/api/turnos/:id/finalizar-triage` | Finalizar triage (asigna prioridad) |
| POST | `/api/turnos/:id/iniciar-atencion` | Enviar a consulta médica |
| POST | `/api/turnos/:id/finalizar-atencion` | Finalizar atención |
| POST | `/api/turnos/:id/no-asiste` | Marcar no asiste |
| POST | `/api/turnos/:id/cancelar` | Cancelar turno |
| POST | `/api/turnos/reiniciar` | Reiniciar el sistema de turnos |

### Dashboard de KPIs

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/kpis/resumen` | Métricas generales (totales y promedios) |
| GET | `/api/kpis/prioridad` | Distribución por prioridad Manchester |
| GET | `/api/kpis/productividad` | Personal destacado (signos vitales y triage) |
| GET | `/api/kpis/tendencia-hora` | Admisiones por hora del día |
| GET | `/api/kpis/tendencia-fecha` | Tendencia diaria de admisiones y tiempos |

> **Filtros**: todos los endpoints KPI aceptan `?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD` y paginación `?registros=N`.

---

## 🗄️ Esquema de la Base de Datos

**Tabla principal**: `esq_emergencia.reporte_emergencia`

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | integer (secuencia) | Identificador único |
| `numero` | integer | Número secuencial del turno en el día |
| `turno` | varchar | Código del turno (ej. `ET1`, `ET15`) |
| `paciente` | varchar | Nombre o documento del paciente |
| `fecha_turno` | timestamp | Emisión del turno |
| `fecha_llamado` | timestamp | Llamado al paciente |
| `fecha_sig_vitales` / `resp_sig_vitales` | timestamp / varchar | Toma de signos vitales |
| `fecha_triage` / `resp_triage` | timestamp / varchar | Evaluación del triage |
| `fecha_inicio_triage` / `fecha_fin_triage` | timestamp | Inicio y fin del triage |
| `fecha_inicio_atencion_medica` / `fecha_fin_atencion_medica` | timestamp | Inicio y fin de la atención médica |
| `fecha_soli_hosp` / `fecha_ing_hospitalizacion` | timestamp | Solicitud e ingreso a hospitalización |
| `prioridad` | varchar | Manchester: `ROJO` / `NARANJA` / `AMARILLO` / `VERDE` / `AZUL` |
| `estado` | varchar | `pendiente`, `llamado`, `en_triage`, `pendiente_medico`, `en_atencion_medica`, `finalizado`, `no_asiste`, `cancelado` |
| `atendido` | boolean | Indica si el turno fue atendido |
| `medico_responsable` / `consultorio` | varchar | Médico y consultorio asignados |
| `tiempo_*` | varchar | Tiempos por etapa del flujo (`HH:MM:SS`) |
| `observacion_estado` | text | Observaciones (motivo de cancelación, etc.) |

El flujo de estados es: `pendiente` → `llamado` → `en_triage` → `pendiente_medico` → `en_atencion_medica` → `finalizado` (o `no_asiste` / `cancelado`).

---

## 🔄 Tiempo Real (Socket.IO)

El backend emite eventos `turno:*` y `sala:*` por Socket.IO en el puerto 3000. Las pantallas:

- **Sala de Espera** y **Manchester**: se refrescan al instante al llamarse un turno.
- **Dashboard**: escucha cualquier evento con anti-rebote (refresco automático en ~1 s) y respeta el interruptor manual *Auto-refresh*.
- Todas tienen respaldo por sondeo HTTP en caso de perder la conexión (indicador visual de estado).

---

## 👤 Autor

- **Repositorio**: [etandazo9256/Unificado_hospital](https://github.com/etandazo9256/Unificado_hospital)
- Equipo de prácticas — Hospital de Especialidades Portoviejo

---

## 📄 Licencia

Proyecto de uso interno del Hospital de Especialidades Portoviejo.
