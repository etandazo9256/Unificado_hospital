// URL base de la API del backend
const API_URL = '/api';

// Instancias de los gráficos para poder destruirlos y recrearlos al filtrar
let chartDemandaHora = null;
let chartPrioridades = null;
let chartTiemposProceso = null;
let chartEvolucionDiaria = null;

// Auto-refresh
let autoRefreshEnabled = true;
let autoRefreshInterval = null;
const AUTO_REFRESH_MS = 30000;
let filtrosActuales = {};

// Ejecutar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    // Configurar fechas iniciales (vacías por defecto para mostrar "Ver Todo")
    const hoy = new Date();
    const haceUnMes = new Date();
    haceUnMes.setMonth(hoy.getMonth() - 1);
    
    // Asignar eventos
    document.getElementById('btnFiltrar').addEventListener('click', filtrarDatos);
    document.getElementById('btnLimpiarFiltros').addEventListener('click', limpiarFiltros);
    document.getElementById('btnRefresh').addEventListener('click', cargarDashboard);
    document.getElementById('btnAutoRefresh').addEventListener('click', toggleAutoRefresh);
    document.getElementById('btnExportExcel').addEventListener('click', () => {
        const fi = document.getElementById('fechaInicio').value;
        const ff = document.getElementById('fechaFin').value;
        exportarExcel(fi, ff);
    });
    document.getElementById('btnExportPDF').addEventListener('click', () => {
        const fi = document.getElementById('fechaInicio').value;
        const ff = document.getElementById('fechaFin').value;
        exportarPDF(fi, ff);
    });

    // Cargar dashboard inicialmente sin filtros (todas las fechas)
    cargarDashboard();
    startAutoRefresh();
});

function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    const icon = document.getElementById('autoRefreshIcon');
    if (autoRefreshEnabled) {
        icon.textContent = '🟢';
        startAutoRefresh();
    } else {
        icon.textContent = '🔴';
        stopAutoRefresh();
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(() => {
        cargarDashboard(filtrosActuales);
    }, AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Función principal para cargar y actualizar todos los componentes del dashboard
async function cargarDashboard(filtros = {}) {
    filtrosActuales = filtros;
    mostrarLoading(true);
    try {
        // Construir string de query string para filtros
        const queryParams = new URLSearchParams(filtros).toString();
        const suffix = queryParams ? `?${queryParams}` : '';

        // Realizar peticiones en paralelo para optimizar rendimiento
        const [resumen, prioridades, productividad, tendenciaHora, tendenciaFecha, comparar, alertas] = await Promise.all([
            fetch(`${API_URL}/kpis/resumen${suffix}`).then(r => r.json()),
            fetch(`${API_URL}/kpis/prioridad${suffix}`).then(r => r.json()),
            fetch(`${API_URL}/kpis/productividad${suffix}`).then(r => r.json()),
            fetch(`${API_URL}/kpis/tendencia-hora${suffix}`).then(r => r.json()),
            fetch(`${API_URL}/kpis/tendencia-fecha${suffix}`).then(r => r.json()),
            fetch(`${API_URL}/kpis/comparar${suffix}`).then(r => r.json()),
            fetch(`${API_URL}/kpis/alertas`).then(r => r.json())
        ]);

        // 1. Actualizar Tarjetas KPI
        actualizarTarjetasKPI(resumen);

        // 2. Renderizar tendencias vs período anterior
        renderTendencias(comparar);

        // 3. Renderizar alertas de espera prolongada
        renderAlertas(alertas);

        // 4. Actualizar hora de última actualización
        actualizarUltimaActualizacion();

        // 5. Renderizar Gráfico 1: Demanda por Hora (Línea/Área)
        renderChartDemandaHora(tendenciaHora);

        // 6. Renderizar Gráfico 2: Prioridades de Triage (Dona)
        renderChartPrioridades(prioridades);

        // 7. Renderizar Gráfico 3: Tiempos de Proceso (Barras)
        renderChartTiemposProceso(resumen);

        // 8. Renderizar Gráfico 4: Evolución Diaria (Barras + Línea)
        renderChartEvolucionDiaria(tendenciaFecha);

        // 9. Actualizar Tablas de Productividad del Personal
        actualizarTablasProductividad(productividad, resumen.total_pacientes);

    } catch (error) {
        console.error('Error al cargar datos del dashboard:', error);
        alert('Ocurrió un error al cargar la información del servidor. Asegúrese de que el backend esté ejecutándose.');
    } finally {
        mostrarLoading(false);
    }
}

// Mostrar/Ocultar indicador de carga o refrescar animación
function mostrarLoading(cargando) {
    const btn = document.getElementById('btnRefresh');
    if (cargando) {
        btn.disabled = true;
        btn.innerHTML = `<span>⏳</span> Cargando...`;
    } else {
        btn.disabled = false;
        btn.innerHTML = `<span>⟳</span> Actualizar`;
    }
}

// Actualizar valores en las tarjetas superiores
function actualizarTarjetasKPI(data) {
    document.getElementById('valTotal').textContent = data.total_pacientes.toLocaleString();
    document.getElementById('valAtendidos').textContent = data.total_atendidos.toLocaleString();
    document.getElementById('valPendientes').textContent = data.total_pendientes.toLocaleString();
    
    // Tiempos promedio
    const totalMinutos = Math.round(data.avg_total_triage);
    document.getElementById('valEsperaTotal').textContent = `${totalMinutos} min`;

    // Porcentajes de atenciones
    const pctAtendidos = data.total_pacientes > 0 ? Math.round((data.total_atendidos / data.total_pacientes) * 100) : 0;
    const pctPendientes = data.total_pacientes > 0 ? Math.round((data.total_pendientes / data.total_pacientes) * 100) : 0;

    const valPctAtendidos = document.getElementById('valPctAtendidos');
    valPctAtendidos.textContent = `${pctAtendidos}% del total`;
    
    const valPctPendientes = document.getElementById('valPctPendientes');
    valPctPendientes.textContent = `${pctPendientes}% del total`;

    // Detallar etiqueta de tiempo
    document.getElementById('labelEsperaSub').textContent = `Promedio de Turno a Triage`;
}

// Actualizar la hora de la última actualización de datos
function actualizarUltimaActualizacion() {
    const el = document.getElementById('lblUltimaActualizacion');
    if (!el) return;
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    const hora = ahora.toLocaleTimeString('es-ES');
    el.textContent = `🕒 Actualizado: ${fecha} ${hora}`;
}

// Mini-tendencias de las tarjetas KPI vs período anterior
function renderTendencias(comparar) {
    const { actual, anterior } = comparar;
    const calc = (a, b) => {
        if (!b || b === 0) return null;
        return Math.round(((a - b) / b) * 100);
    };

    const setTrend = (id, actualVal, anteriorVal, invertir) => {
        const el = document.getElementById(id);
        const p = calc(actualVal, anteriorVal);
        if (p === null || isNaN(p)) {
            el.innerHTML = `<span class="trend-neutral">—</span>`;
            return;
        }
        const esPositivo = invertir ? p <= 0 : p >= 0;
        const arrow = p >= 0 ? '▲' : '▼';
        const cls = id === 'trendTotal' ? 'trend-info' : (esPositivo ? 'trend-up' : 'trend-down');
        el.innerHTML = `<span class="${cls}">${arrow} ${Math.abs(p)}%</span>`;
    };

    setTrend('trendTotal', actual.total_pacientes, anterior.total_pacientes, false);
    setTrend('trendAtendidos', actual.total_atendidos, anterior.total_atendidos, false);
    setTrend('trendPendientes', actual.total_pendientes, anterior.total_pendientes, true);
    setTrend('trendEspera', actual.avg_total_triage, anterior.avg_total_triage, true);
}

// Panel de alertas: pacientes en espera que exceden el tiempo objetivo
const PRIORIDAD_NOMBRE = {
    'P1-RESUCITACION': 'P1 Resucitación',
    'P2-EMERGENCIA': 'P2 Emergencia',
    'P3-URGENCIA': 'P3 Urgencia',
    'P4-MENOS_URGENTE': 'P4 Menos Urgente',
    'P5-NO_URGENTE': 'P5 No Urgente',
    'ROJO': 'Rojo',
    'AMARILLO': 'Amarillo',
    'VERDE': 'Verde',
    'SIN CLASIFICAR': 'Sin clasificar'
};

function renderAlertas(data) {
    const panel = document.getElementById('alertasEspera');
    const lista = document.getElementById('alertasList');
    const count = document.getElementById('alertasCount');

    if (!data.alertas || data.alertas.length === 0) {
        panel.style.display = 'none';
        return;
    }

    const critico = a => a.prioridad === 'P1-RESUCITACION' || a.prioridad === 'ROJO' || a.prioridad === 'P2-EMERGENCIA';

    panel.style.display = 'block';
    count.textContent = `${data.alertas.length} paciente(s) exceden el tiempo objetivo`;
    lista.innerHTML = data.alertas.slice(0, 6).map(a => `
        <div class="alerta-item ${critico(a) ? 'critico' : ''}">
            <div class="alerta-info">
                <span class="alerta-paciente">${a.paciente || 'Paciente'}</span>
                <span class="alerta-meta">${a.turno ? `Turno ${a.turno} · ` : ''}${(a.estado || '').replace(/_/g, ' ')} · ${PRIORIDAD_NOMBRE[a.prioridad] || a.prioridad || 'N/A'}</span>
            </div>
            <span class="alerta-minutos">${a.minutos_espera} min</span>
        </div>
    `).join('');
}

// Aplicar filtros seleccionados por el usuario
function filtrarDatos() {
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin = document.getElementById('fechaFin').value;

    const filtros = {};
    if (fechaInicio) filtros.fechaInicio = fechaInicio;
    if (fechaFin) filtros.fechaFin = fechaFin;

    if (fechaInicio && fechaFin && new Date(fechaInicio) > new Date(fechaFin)) {
        alert('La fecha de inicio no puede ser posterior a la fecha de fin.');
        return;
    }

    document.querySelectorAll('.btn-quick').forEach(b => b.classList.remove('active'));
    periodoActivo = 'todos';

    cargarDashboard(filtros);
}

// Restablecer filtros y recargar
function limpiarFiltros() {
    document.getElementById('fechaInicio').value = '';
    document.getElementById('fechaFin').value = '';
    document.querySelectorAll('.btn-quick').forEach(b => b.classList.remove('active'));
    periodoActivo = 'todos';
    cargarDashboard();
}

// Filtros rápidos por período
function filtrarPeriodo(periodo) {
    const hoy = new Date();
    let fechaInicio, fechaFin;

    switch (periodo) {
        case 'semana_actual': {
            const diaSemana = hoy.getDay();
            const diffLunes = diaSemana === 0 ? 6 : diaSemana - 1;
            fechaInicio = new Date(hoy);
            fechaInicio.setDate(hoy.getDate() - diffLunes);
            fechaFin = new Date(hoy);
            break;
        }
        case 'semana_anterior': {
            const diaSemana = hoy.getDay();
            const diffLunes = diaSemana === 0 ? 6 : diaSemana - 1;
            fechaInicio = new Date(hoy);
            fechaInicio.setDate(hoy.getDate() - diffLunes - 7);
            fechaFin = new Date(fechaInicio);
            fechaFin.setDate(fechaInicio.getDate() + 6);
            break;
        }
        case 'mes_actual': {
            fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            fechaFin = new Date(hoy);
            break;
        }
        case 'mes_anterior': {
            fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
            fechaFin = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
            break;
        }
        case 'trimestre': {
            fechaInicio = new Date(hoy);
            fechaInicio.setMonth(hoy.getMonth() - 3);
            fechaFin = new Date(hoy);
            break;
        }
        case 'anio_actual': {
            fechaInicio = new Date(hoy.getFullYear(), 0, 1);
            fechaFin = new Date(hoy);
            break;
        }
        case 'anio_anterior': {
            fechaInicio = new Date(hoy.getFullYear() - 1, 0, 1);
            fechaFin = new Date(hoy.getFullYear() - 1, 11, 31);
            break;
        }
    }

    const toLocalDateStr = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dia}`;
    };

    document.getElementById('fechaInicio').value = toLocalDateStr(fechaInicio);
    document.getElementById('fechaFin').value = toLocalDateStr(fechaFin);

    document.querySelectorAll('.btn-quick').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    periodoActivo = periodo;

    cargarDashboard({ fechaInicio: toLocalDateStr(fechaInicio), fechaFin: toLocalDateStr(fechaFin) });
}

// --- RENDERIZACIÓN DE GRÁFICOS (CHART.JS) ---

// Gráfico 1: Demanda por Hora (Línea/Área)
function renderChartDemandaHora(datos) {
    const ctx = document.getElementById('chartDemandaHora').getContext('2d');
    
    // Crear array completo de 24 horas inicializado en 0
    const horasData = Array(24).fill(0);
    datos.forEach(d => {
        if (d.hora >= 0 && d.hora < 24) {
            horasData[d.hora] = d.cantidad;
        }
    });

    const labels = Array.from({length: 24}, (_, i) => `${i.toString().padStart(2, '0')}:00`);

    if (chartDemandaHora) chartDemandaHora.destroy();

    chartDemandaHora = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pacientes Admitidos',
                data: horasData,
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#3B82F6',
                pointRadius: 2,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#1E293B',
                    titleColor: '#F8FAFC',
                    bodyColor: '#94A3B8',
                    borderWidth: 1,
                    borderColor: '#334155'
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#64748B', font: { family: 'Outfit' } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#64748B', font: { family: 'Outfit' }, stepSize: 10 }
                }
            }
        }
    });
}

// Gráfico 2: Prioridades de Triage Manchester (Barras Horizontales + %)
function renderChartPrioridades(prioridades) {
    const ctx = document.getElementById('chartPrioridades').getContext('2d');
    
    const colorMap = {
        'P1-RESUCITACION': { label: 'P1 Resucitación', color: '#DC2626', order: 1 },
        'ROJO': { label: 'P1 Resucitación', color: '#DC2626', order: 1 },
        'P2-EMERGENCIA': { label: 'P2 Emergencia', color: '#EA580C', order: 2 },
        'P3-URGENCIA': { label: 'P3 Urgencia', color: '#CA8A04', order: 3 },
        'AMARILLO': { label: 'P3 Urgencia', color: '#CA8A04', order: 3 },
        'P4-MENOS_URGENTE': { label: 'P4 Menos Urgente', color: '#16A34A', order: 4 },
        'VERDE': { label: 'P4 Menos Urgente', color: '#16A34A', order: 4 },
        'P5-NO_URGENTE': { label: 'P5 No Urgente', color: '#2563EB', order: 5 },
        'SIN CLASIFICAR': { label: 'Sin Clasificar', color: '#64748B', order: 6 }
    };

    const agrupado = {};
    prioridades.forEach(p => {
        const map = colorMap[p.prioridad];
        if (map) {
            if (!agrupado[map.label]) {
                agrupado[map.label] = { label: map.label, color: map.color, order: map.order, cantidad: 0 };
            }
            agrupado[map.label].cantidad += p.cantidad;
        }
    });

    const sorted = Object.values(agrupado).sort((a, b) => a.order - b.order);
    const labels = sorted.map(s => s.label);
    const data = sorted.map(s => s.cantidad);
    const colors = sorted.map(s => s.color);
    const total = data.reduce((sum, v) => sum + v, 0);

    if (chartPrioridades) chartPrioridades.destroy();

    chartPrioridades = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pacientes',
                data: data,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 6,
                barThickness: 32
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 60 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1E293B',
                    titleColor: '#F8FAFC',
                    bodyColor: '#94A3B8',
                    borderWidth: 1,
                    borderColor: '#334155',
                    callbacks: {
                        label: function(ctx) {
                            const pct = total > 0 ? ((ctx.parsed.x / total) * 100).toFixed(1) : 0;
                            return ` ${ctx.parsed.x} pacientes (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#64748B', font: { family: 'Outfit' }, stepSize: 10 },
                    title: { display: true, text: 'Cantidad de Pacientes', color: '#64748B', font: { family: 'Outfit', size: 11 } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#94A3B8', font: { family: 'Outfit', size: 12, weight: '600' } }
                }
            }
        }
    });
}
// Gráfico 3: Tiempos de Proceso por Etapa (Barras)
function renderChartTiemposProceso(resumen) {
    const ctx = document.getElementById('chartTiemposProceso').getContext('2d');
    
    // Obtener los tiempos promedio del resumen
    const tiempos = [
        resumen.avg_espera_signos,
        resumen.avg_duracion_signos,
        resumen.avg_espera_triage,
        resumen.avg_duracion_triage,
        resumen.avg_total_triage
    ];

    const labels = [
        'Espera de Signos',
        'Toma de Signos',
        'Espera de Triage',
        'Toma de Triage',
        'Tiempo de Proceso Total'
    ];

    if (chartTiemposProceso) chartTiemposProceso.destroy();

    chartTiemposProceso = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tiempo Promedio (Minutos)',
                data: tiempos,
                backgroundColor: [
                    'rgba(59, 130, 246, 0.4)', // Azul
                    'rgba(59, 130, 246, 0.7)', // Azul oscuro
                    'rgba(139, 92, 246, 0.4)', // Púrpura
                    'rgba(139, 92, 246, 0.7)', // Púrpura oscuro
                    'rgba(16, 185, 129, 0.7)'  // Verde para el total
                ],
                borderColor: [
                    '#3B82F6',
                    '#2563EB',
                    '#8B5CF6',
                    '#7C3AED',
                    '#10B981'
                ],
                borderWidth: 1.5,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1E293B',
                    titleColor: '#F8FAFC',
                    bodyColor: '#94A3B8',
                    borderWidth: 1,
                    borderColor: '#334155',
                    callbacks: {
                        label: function(context) {
                            return ` ${context.parsed.y.toFixed(1)} minutos`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748B', font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#64748B', font: { family: 'Outfit' } }
                }
            }
        }
    });
}

// Gráfico 4: Evolución Diaria (Barras + Línea)
function renderChartEvolucionDiaria(tendenciaFecha) {
    const ctx = document.getElementById('chartEvolucionDiaria').getContext('2d');
    
    // Ordenar fechas cronológicamente
    tendenciaFecha.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    // Formatear etiquetas de fecha a 'DD/MM'
    const labels = tendenciaFecha.map(d => {
        const dateObj = new Date(d.fecha);
        // Ajustar huso horario local
        dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
        return dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    });

    const admisiones = tendenciaFecha.map(d => d.cantidad);
    const tiempoTotal = tendenciaFecha.map(d => d.avg_total_triage);

    if (chartEvolucionDiaria) chartEvolucionDiaria.destroy();

    chartEvolucionDiaria = new Chart(ctx, {
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Pacientes Admitidos',
                    data: admisiones,
                    backgroundColor: 'rgba(59, 130, 246, 0.4)',
                    borderColor: '#3B82F6',
                    borderWidth: 1.5,
                    borderRadius: 4,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: 'Tiempo de Triage (Minutos)',
                    data: tiempoTotal,
                    borderColor: '#A78BFA',
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    tension: 0.3,
                    pointBackgroundColor: '#A78BFA',
                    pointRadius: 3,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94A3B8', font: { family: 'Outfit', size: 11 } }
                },
                tooltip: {
                    backgroundColor: '#1E293B',
                    titleColor: '#F8FAFC',
                    bodyColor: '#94A3B8',
                    borderWidth: 1,
                    borderColor: '#334155'
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748B', font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255,255,255,0.03)' },
                    ticks: { color: '#64748B', font: { family: 'Outfit' } },
                    title: { display: true, text: 'Cantidad de Pacientes', color: '#64748B', font: { family: 'Outfit' } }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false }, // evita duplicar líneas de cuadrícula
                    ticks: { color: '#64748B', font: { family: 'Outfit' } },
                    title: { display: true, text: 'Minutos Promedio', color: '#64748B', font: { family: 'Outfit' } }
                }
            }
        }
    });
}

// --- ACTUALIZACIÓN DE TABLAS DE PRODUCTIVIDAD ---
function actualizarTablasProductividad(productividad, totalPacientes) {
    // 1. Tabla de Toma de Signos Vitales
    const tbodySignos = document.querySelector('#tableSignos tbody');
    tbodySignos.innerHTML = '';
    
    if (productividad.signos_vitales.length === 0) {
        tbodySignos.innerHTML = '<tr><td colspan="3" class="loading-cell">No hay datos en el período</td></tr>';
    } else {
        productividad.signos_vitales.forEach(item => {
            const porcentaje = totalPacientes > 0 ? ((item.cantidad / totalPacientes) * 100).toFixed(1) : 0;
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>${item.personal}</td>
                <td style="text-align: right; font-weight: 600;">${item.cantidad.toLocaleString()}</td>
                <td>
                    <div class="table-progress-cell">
                        <span>${porcentaje}%</span>
                        <div class="progress-bar-container">
                            <div class="progress-bar blue" style="width: ${porcentaje}%"></div>
                        </div>
                    </div>
                </td>
            `;
            tbodySignos.appendChild(fila);
        });
    }

    // 2. Tabla de Triage Médico
    const tbodyTriage = document.querySelector('#tableTriage tbody');
    tbodyTriage.innerHTML = '';

    if (productividad.triage.length === 0) {
        tbodyTriage.innerHTML = '<tr><td colspan="3" class="loading-cell">No hay datos en el período</td></tr>';
    } else {
        productividad.triage.forEach(item => {
            const porcentaje = totalPacientes > 0 ? ((item.cantidad / totalPacientes) * 100).toFixed(1) : 0;
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>${item.personal}</td>
                <td style="text-align: right; font-weight: 600;">${item.cantidad.toLocaleString()}</td>
                <td>
                    <div class="table-progress-cell">
                        <span>${porcentaje}%</span>
                        <div class="progress-bar-container">
                            <div class="progress-bar green" style="width: ${porcentaje}%"></div>
                        </div>
                    </div>
                </td>
            `;
            tbodyTriage.appendChild(fila);
        });
    }
}
