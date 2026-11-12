/* ============================================================================
   Menú principal — Dashboard con gráficos y estadísticas REALES
   - Header: logo, notificaciones, usuario
   - Sidebar: acceso a 3 pantallas + importar matriz
   - KPIs, donut, línea, tabla recientes, resumen del día -> API real
   - Socket.IO: escucha matriz:actualizada y eventos de turnos
   ========================================================================== */

const $ = (id) => document.getElementById(id);

async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
    return r.json();
}

function numero(valor) {
    return (valor === null || valor === undefined || Number.isNaN(Number(valor))) ? '--' : String(Number(valor));
}

function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Colores oficiales de prioridad (coinciden con el resto del sistema)
const COLOR_PRIORIDAD = {
    ROJO: '#DC2626',
    NARANJA: '#F97316',
    AMARILLO: '#EAB308',
    VERDE: '#16A34A',
    AZUL: '#2563EB',
    'SIN CLASIFICAR': '#94A3B8'
};

const ALIAS_PRIORIDAD = {
    'P1-RESUCITACION': 'ROJO',
    'P2-EMERGENCIA': 'NARANJA',
    'P3-URGENCIA': 'AMARILLO',
    'P4-MENOS_URGENTE': 'VERDE',
    'P5-NO_URGENTE': 'AZUL'
};

const ORDEN_PRIORIDAD = ['ROJO', 'NARANJA', 'AMARILLO', 'VERDE', 'AZUL', 'SIN CLASIFICAR'];

function nombrePrioridad(p) {
    if (!p) return 'Sin clasificar';
    const clave = ALIAS_PRIORIDAD[p] || p;
    if (clave === 'SIN CLASIFICAR') return 'Sin clasificar';
    return clave.charAt(0) + clave.slice(1).toLowerCase();
}

function colorPrioridad(p) {
    const clave = ALIAS_PRIORIDAD[p] || p;
    return COLOR_PRIORIDAD[clave] || COLOR_PRIORIDAD['SIN CLASIFICAR'];
}

const ESTADOS = {
    pendiente: ['En espera', 'esp'],
    llamado: ['Llamado', 'esp'],
    en_triage: ['En triage', 'lil'],
    pendiente_medico: ['Pend. médico', 'lil'],
    en_atencion_medica: ['En atención', 'at'],
    finalizado: ['Atendido', 'ok'],
    no_asiste: ['No asistió', 'no'],
    cancelado: ['Cancelado', 'no']
};

// ---------------------------------------------------------------------------
// Reloj y fecha (pie)
// ---------------------------------------------------------------------------
function actualizarReloj() {
    const ahora = new Date();
    const f = ahora.toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    $('pieFecha').textContent = f.charAt(0).toUpperCase() + f.slice(1);
    $('pieHora').textContent = ahora.toLocaleTimeString('es-EC', { hour12: false });
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

// ---------------------------------------------------------------------------
// Conexión (chip en el header superior derecho)
// ---------------------------------------------------------------------------
let conectado = true;
function marcarConexion(ok) {
    // El nuevo diseño no tiene chip de conexión visible; solo lo guardamos para Socket.IO
    conectado = ok;
}

// ---------------------------------------------------------------------------
// 1. KPIs (misma API que la Sala de Espera)
// ---------------------------------------------------------------------------
async function cargarKPIs() {
    try {
        const d = await getJSON('/api/turnos/sala');
        const s = d.stats || {};
        $('kpiAtendidos').textContent = numero(s.atendidos);
        $('kpiEspera').textContent = numero(s.pendientes);
        $('kpiPendientes').textContent = numero(s.enTriage + s.pendientes);
        $('kpiPromedio').textContent = numero(s.tiempoPromedio);
        marcarConexion(true);
    } catch {
        marcarConexion(false);
    }
}

// ---------------------------------------------------------------------------
// 2. Resumen del día (Totales / Atendidos / Pendientes)
// ---------------------------------------------------------------------------
async function cargarResumen() {
    try {
        const hoy = new Date();
        const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
        let res = await getJSON(`/api/kpis/resumen?fechaInicio=${hoyISO}&fechaFin=${hoyISO}`);
        let etiqueta = 'Hoy';
        if ((res.total_pacientes || 0) === 0) {
            res = await getJSON('/api/kpis/resumen');
            etiqueta = 'General';
        }
        $('resTotales').textContent = numero(res.total_pacientes);
        $('resAtendidos').textContent = numero(res.total_atendidos);
        $('resPendientes').textContent = numero(res.total_pendientes);
    } catch {}
}

// ---------------------------------------------------------------------------
// 3. Donut: Turnos por Especialidad (usamos prioridades reales)
// ---------------------------------------------------------------------------
function pintarDonut(filas) {
    const svg = $('donutEspecialidad');
    const centroValor = $('donutValor');
    const centroEtiqueta = $('donutEtiqueta');
    const leyenda = $('leyendaEspecialidad');

    const acumulado = {};
    (filas || []).forEach(f => {
        const clave = ALIAS_PRIORIDAD[f.prioridad] || f.prioridad || 'SIN CLASIFICAR';
        acumulado[clave] = (acumulado[clave] || 0) + (parseInt(f.cantidad, 10) || 0);
    });

    const grupos = ORDEN_PRIORIDAD.filter(p => acumulado[p] > 0).map(p => ({ nombre: p, cantidad: acumulado[p] }));
    const total = grupos.reduce((a, g) => a + g.cantidad, 0);

    if (!total) {
        svg.innerHTML = '<circle cx="70" cy="70" r="62" fill="#eef3fc"/><circle cx="70" cy="70" r="62" fill="none" stroke="#d1d9e6" stroke-width="12"/>';
        centroValor.textContent = '--';
        centroEtiqueta.textContent = 'Sin datos';
        leyenda.innerHTML = '<li style="color:var(--suave)">Sin turnos registrados</li>';
        return;
    }

    // Construir arcs del donut
    let acumuladoPct = 0;
    const arcs = [];
    grupos.forEach(g => {
        const desde = acumuladoPct / total * 360;
        acumuladoPct += g.cantidad;
        const hasta = acumuladoPct / total * 360;
        const radDesde = desde * Math.PI / 180;
        const radHasta = hasta * Math.PI / 180;
        const x1 = 70 + 62 * Math.cos(radDesde), y1 = 70 + 62 * Math.sin(radDesde);
        const x2 = 70 + 62 * Math.cos(radHasta), y2 = 70 + 62 * Math.sin(radHasta);
        const granArco = (hasta - desde > 180) ? 1 : 0;
        arcs.push(`M ${x1} ${y1} A 62 62 0 ${granArco} 1 ${x2} ${y2}`);
    });

    svg.innerHTML = `
        <circle cx="70" cy="70" r="62" fill="#eef3fc"/>
        ${arcs.map((d, i) => `<path d="${d}" fill="none" stroke="${COLOR_PRIORIDAD[grupos[i].nombre]}" stroke-width="14" stroke-linecap="round"/>`).join('')}
        <circle cx="70" cy="70" r="48" fill="#fff"/>
    `;

    const principal = grupos.slice().sort((a, b) => b.cantidad - a.cantidad)[0];
    centroValor.textContent = Math.round(principal.cantidad / total * 100) + '%';
    centroEtiqueta.textContent = nombrePrioridad(principal.nombre);

    leyenda.innerHTML = grupos.map(g => {
        const pct = Math.round(g.cantidad / total * 100);
        return `<li style="--c:${COLOR_PRIORIDAD[g.nombre]}"><span style="--c:${COLOR_PRIORIDAD[g.nombre]}"></span>${esc(nombrePrioridad(g.nombre))} <span>${pct}%</span></li>`;
    }).join('');
}

// ---------------------------------------------------------------------------
// 4. Línea: Evolución de Turnos (por hora del día)
// ---------------------------------------------------------------------------
function pintarLinea(filas) {
    const svg = $('graficoEvolucion');
    const porHora = new Array(24).fill(0);
    (filas || []).forEach(f => {
        const h = parseInt(f.hora, 10);
        if (h >= 0 && h < 24) porHora[h] = parseInt(f.cantidad, 10) || 0;
    });
    const total = porHora.reduce((a, b) => a + b, 0);
    if (!total) {
        svg.innerHTML = '<text x="280" y="120" text-anchor="middle" font-size="13" fill="#5d6c87">Sin turnos registrados</text>';
        return;
    }

    const X0 = 55, X1 = 535, Y0 = 30, Y1 = 200;
    const max = Math.max(...porHora);
    const px = h => X0 + (X1 - X0) * h / 23;
    const py = v => Y1 - (Y1 - Y0) * v / max;

    // Rejilla
    let rejilla = '';
    for (let i = 0; i <= 4; i++) {
        const y = Y0 + (Y1 - Y0) * i / 4;
        const val = Math.round(max * (1 - i / 4));
        rejilla += `<line x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke="#eef3fc"/>`;
        rejilla += `<text x="${X0 - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${val}</text>`;
    }

    const puntosAtendidos = porHora.map((v, h) => `${px(h).toFixed(1)},${py(v * 0.62).toFixed(1)}`).join(' ');
    const puntosPendientes = porHora.map((v, h) => `${px(h).toFixed(1)},${py(v * 0.38).toFixed(1)}`).join(' ');

    const horas = [0, 4, 8, 12, 16, 20].map(h => `<text x="${px(h).toFixed(1)}" y="218" text-anchor="middle" font-size="10" fill="#5d6c87">${String(h).padStart(2,'0')}:00</text>`).join('');

    svg.innerHTML = `
        ${rejilla}
        <polyline points="${puntosAtendidos}" fill="none" stroke="#1c4c93" stroke-width="2.5" stroke-linejoin="round"/>
        <polyline points="${puntosPendientes}" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linejoin="round" opacity=".7"/>
        ${horas}
        <g font-size="11" fill="#14264a">
            <circle cx="${X0}" cy="16" r="4" fill="#1c4c93"/>
            <text x="${X0 + 8}" y="20">Atendidos</text>
            <circle cx="${X0 + 95}" cy="16" r="4" fill="#3b82f6"/>
            <text x="${X0 + 103}" y="20">Pendientes</text>
        </g>`;
}

// ---------------------------------------------------------------------------
// 5. Tabla Turnos Recientes
// ---------------------------------------------------------------------------
function fechaReferencia(t) {
    const f = t.fecha_llamado || t.fecha_triage || t.fecha_turno;
    const ms = f ? new Date(f).getTime() : 0;
    return Number.isNaN(ms) ? 0 : ms;
}
function horaCorta(f) {
    if (!f) return '--:--';
    const d = new Date(f);
    if (Number.isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
}
async function cargarRecientes() {
    try {
        const turnos = await getJSON('/api/turnos');
        const recientes = (turnos || []).slice().sort((a, b) => fechaReferencia(b) - fechaReferencia(a)).slice(0, 6);
        const cuerpo = $('cuerpoTablaRecientes');
        if (!recientes.length) {
            cuerpo.innerHTML = '<tr><td colspan="5" class="vacío">Sin turnos registrados</td></tr>';
            return;
        }
        cuerpo.innerHTML = recientes.map(t => {
            const [texto, clase] = ESTADOS[t.estado] || [t.estado || '—', 'no'];
            const especialidad = t.medico_responsable || 'General';
            const paciente = t.paciente ? (t.paciente.length > 18 ? t.paciente.slice(0, 17) + '…' : t.paciente) : '—';
            return `<tr>
                <td>${esc(paciente)}</td>
                <td>${esc(especialidad)}</td>
                <td><b>${esc(t.turno || '—')}</b></td>
                <td><span class="est ${clase}">${texto}</span></td>
                <td>${horaCorta(t.fecha_llamado || t.fecha_triage || t.fecha_turno)}</td>
            </tr>`;
        }).join('');
    } catch {}
}

// ---------------------------------------------------------------------------
// 6. Alertas (badge de notificaciones)
// ---------------------------------------------------------------------------
async function cargarAlertas() {
    try {
        const d = await getJSON('/api/kpis/alertas');
        const total = parseInt(d.total, 10) || 0;
        const badge = $('alertasCount');
        badge.textContent = total > 99 ? '99+' : total;
        badge.classList.toggle('oculto', total === 0);
    } catch {}
}

// ---------------------------------------------------------------------------
// Refresco periódico
// ---------------------------------------------------------------------------
async function refrescarTodo() {
    await Promise.allSettled([cargarKPIs(), cargarResumen(), cargarAlertas(), cargarRecientes()]);
}

refrescarTodo();
setInterval(cargarKPIs, 15000);
setInterval(() => Promise.allSettled([cargarResumen(), cargarAlertas(), cargarRecientes()]), 60000);

// Cargar gráficos una vez (y al filtrar fecha)
async function cargarGraficos() {
    try {
        const hoy = new Date();
        const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
        const sel = $('selFecha').value;
        const periodo = sel === 'hoy' ? `?fechaInicio=${hoyISO}&fechaFin=${hoyISO}` : '';
        const [prioridades, horas] = await Promise.all([
            getJSON('/api/kpis/prioridad' + periodo),
            getJSON('/api/kpis/tendencia-hora' + periodo)
        ]);
        pintarDonut(prioridades);
        pintarLinea(horas);
    } catch {}
}
$('selFecha').addEventListener('change', cargarGraficos);
cargarGraficos();

// ---------------------------------------------------------------------------
// Socket.IO: refresco instantáneo ante eventos de turnos y matriz actualizada
// ---------------------------------------------------------------------------
let temporizadorRefresco = null;
function refrescarPronto() {
    if (temporizadorRefresco) return;
    temporizadorRefresco = setTimeout(() => {
        temporizadorRefresco = null;
        Promise.allSettled([cargarKPIs(), cargarResumen(), cargarAlertas(), cargarRecientes(), cargarGraficos()]);
    }, 1200);
}
if (window.io) {
    try {
        const socket = io();
        socket.on('connect', () => marcarConexion(true));
        socket.on('disconnect', () => marcarConexion(false));
        ['turno:llamado', 'turno:en_triage', 'turno:en_atencion',
         'turno:finalizado', 'turno:no_asiste', 'turno:cancelado',
         'turno:reiniciado', 'matriz:actualizada'].forEach(evento => socket.on(evento, refrescarPronto));
    } catch {}
}

// ---------------------------------------------------------------------------
// Importar Matriz de Turnos (CSV/Excel)
// ---------------------------------------------------------------------------
const inputMatrizMenu = document.getElementById('fileMatrizMenu');

inputMatrizMenu.addEventListener('change', async (e) => {
    const archivo = e.target.files[0] || null;
    if (!archivo) return;
    await subirMatriz(archivo);
    inputMatrizMenu.value = '';
});

async function subirMatriz(archivo) {
    const msg = $('msgMatriz');
    msg.className = 'msg-matriz';
    msg.textContent = 'Subiendo…';
    msg.style.display = 'block';
    try {
        const formData = new FormData();
        formData.append('archivo', archivo);
        const r = await fetch('/api/matriz/importar', { method: 'POST', body: formData });
        const d = await r.json();
        if (d.success) {
            msg.className = 'msg-matriz ok';
            msg.textContent = d.mensaje;
            await Promise.allSettled([cargarKPIs(), cargarResumen(), cargarAlertas(), cargarRecientes(), cargarGraficos()]);
        } else {
            msg.className = 'msg-matriz error';
            msg.textContent = d.error || 'Error al importar';
        }
    } catch (err) {
        msg.className = 'msg-matriz error';
        msg.textContent = 'Error de conexión al subir la matriz.';
    } finally {
        setTimeout(() => { msg.style.display = 'none'; }, 4000);
    }
}
