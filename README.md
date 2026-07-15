# 🏥 HEP Dashboard — Hospital de Especialidades Portoviejo

**Dashboard de Indicadores Clave de Rendimiento (KPI) para el Área de Emergencia**

Sistema web para la gestión de turnos y visualización de indicadores hospitalarios del Departamento de Emergencia del Hospital de Especialidades Portoviejo, Ecuador.

---

## 📋 Descripción del Proyecto

Este proyecto consta de dos módulos principales:

### 1. Sistema de Gestión de Turnos
Pantalla operativa para la administración en tiempo real de la cola de atención de pacientes en el área de emergencia.

- Visualización del turno en atención actual.
- Lista de próximos turnos pendientes.
- Botones de acción: Siguiente turno, Llamar y Reiniciar sistema.
- Estadísticas en vivo: pendientes, atendidos, total y tiempo de espera promedio.
- Reloj en tiempo real y atajos de teclado.

### 2. Dashboard de KPIs de Emergencia
Panel analítico y administrativo para directores, jefes de servicio y analistas de calidad hospitalaria.

- **Tarjetas de KPI**: Total de pacientes registrados, atendidos, pendientes y tiempo promedio total de atención (en minutos).
- **Gráfico de Demanda por Hora**: Distribución de admisiones por hora del día para identificar horas pico.
- **Gráfico de Prioridades de Triage**: Distribución por gravedad (Rojo, Amarillo, Verde, Sin Clasificar).
- **Gráfico de Tiempos por Etapa**: Comparación de tiempos promedio en cada fase del proceso (espera de signos, toma de signos, espera de triage, evaluación de triage y tiempo total).
- **Gráfico de Evolución Diaria**: Tendencia de admisiones por fecha con correlación de tiempos de respuesta.
- **Tablas de Productividad**: Top 5 del personal de enfermería (signos vitales) y médicos (triage) con barras de progreso visual.
- **Filtro por Rango de Fechas**: Permite acotar los indicadores a un período específico.

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
│   ├── db.js                  # Configuración de conexión a PostgreSQL
│   ├── server.js              # Servidor Express con endpoints de turnos y KPIs
│   ├── routes/
│   │   └── turnos.js          # (Reservado para rutas modulares)
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── index.html             # Pantalla de gestión de turnos
│   ├── app.js                 # Lógica del sistema de turnos
│   ├── style.css              # Estilos del sistema de turnos
│   ├── dashboard.html         # Dashboard de indicadores KPI
│   ├── dashboard.js           # Lógica del dashboard (Chart.js + API)
│   ├── dashboard.css          # Estilos del dashboard (Dark Medical UI)
│   └── logo-hospital.png      # Logo del hospital
│
├── .gitignore
└── README.md
```

---

## ⚙️ Requisitos Previos

- **Node.js** v18 o superior
- **PostgreSQL** v14 o superior
- Base de datos `hospital_prueba` con esquema `esq_emergencia` y tabla `reporte_emergencia`

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

Editar el archivo `backend/db.js` con las credenciales locales:

```javascript
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'TU_CLAVE',
    database: 'hospital_prueba'
});
```

### 4. Iniciar el servidor backend

```bash
npm start
```

El servidor se ejecutará en `http://localhost:3000`.

### 5. Abrir el frontend

Abrir directamente en el navegador:

- **Turnos**: `frontend/index.html`
- **Dashboard KPI**: `frontend/dashboard.html`

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

**Tabla principal**: `esq_emergencia.reporte_emergencia`

| Columna                         | Tipo          | Descripción                                  |
|---------------------------------|---------------|----------------------------------------------|
| `id`                            | integer       | Identificador único (PK)                     |
| `numero`                        | integer       | Número secuencial del turno                  |
| `turno`                         | varchar       | Código del turno (ej: ET1, ET202)            |
| `paciente`                      | varchar       | Nombre completo del paciente                 |
| `fecha_turno`                   | timestamp     | Fecha y hora de emisión del turno            |
| `fecha_llamado`                 | timestamp     | Fecha y hora del llamado al paciente         |
| `fecha_sig_vitales`             | timestamp     | Fecha y hora de toma de signos vitales       |
| `resp_sig_vitales`              | varchar       | Profesional que tomó signos vitales          |
| `fecha_triage`                  | timestamp     | Fecha y hora de evaluación de triage         |
| `resp_triage`                   | varchar       | Médico responsable del triage                |
| `prioridad`                     | varchar       | Prioridad asignada (ROJO/AMARILLO/VERDE)     |
| `atendido`                      | boolean       | Estado de atención del turno                 |
| `tiempo_espera_turno_signos`    | varchar       | Tiempo de espera turno → signos (HH:MM:SS)  |
| `tiempo_duracion_signos_vitales`| varchar       | Duración de toma de signos (HH:MM:SS)       |
| `tiempo_espera_signos_triage`   | varchar       | Tiempo de espera signos → triage (HH:MM:SS) |
| `tiempo_duracion_triage`        | varchar       | Duración del triage (HH:MM:SS)              |
| `tiempo_total_turno_triage`     | varchar       | Tiempo total turno → fin triage (HH:MM:SS)  |

**Vista**: `esq_emergencia.vw_reporte_atencion` — Vista resumida con paciente, turno, responsables y tiempo total calculado como intervalo.

---

## 👤 Autor

- **Repositorio**: [etandazo9256/hep_dashboard](https://github.com/etandazo9256/hep_dashboard)

---

## 📄 Licencia

Este proyecto es de uso interno del Hospital de Especialidades Portoviejo.
