/* ============================================================================
   Menú principal — diseño menu_muestra con datos REALES de la API
   - Reloj y fecha (pie)
   - KPIs, dona, gráfico línea, tabla recientes, resumen del día -> API real
   - Campana de alertas (espera prolongada) -> API real
   - Botón Importar Matriz (CSV/Excel) en el header
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

// Colores oficiales de prioridad
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
    $('fecha').textContent = f.charAt(0).toUpperCase() + f.slice(1);
    $('hora').textContent = ahora.toLocaleTimeString('es-EC', { hour12: false });
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

// ---------------------------------------------------------------------------
// 1. KPIs de la sala (misma API que la Sala de Espera)
// ---------------------------------------------------------------------------
async function cargarKPIs() {
    try {
        const d = await getJSON('/api/turnos/sala');
        const s = d.stats || {};
        $('kpiAtendidos').textContent = numero(s.atendidos);
        $('kpiTendAtendidos').textContent = s.enConsulta > 0 ? `+${s.enConsulta} en consulta` : '--';
        $('kpiPendientes').textContent = numero(s.pendientes);
        $('kpiTendPendientes').textContent = s.lambda > 0 ? `+${s.lambda} última hora` : '--';
        $('kpiTurnosPendientes').textContent = numero(s.pendientes);
        $('kpiTendTurnos').textContent = '--';
        $('kpiPromedio').textContent = numero(s.tiempoPromedio);
        $('kpiTendPromedio').textContent = 'minutos';
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
        if ((res.total_pacientes || 0) === 0) {
            res = await getJSON('/api/kpis/resumen');
            $('chipPeriodo').textContent = 'General';
        } else {
            $('chipPeriodo').textContent = 'Hoy';
        }
        $('resTotales').textContent = numero(res.total_pacientes);
        $('resAtendidos').textContent = numero(res.total_atendidos);
        $('resPendientes').textContent = numero(res.total_pendientes);
    } catch {}
}

// ---------------------------------------------------------------------------
// 3. Dona: Turnos por Especialidad (usamos prioridades reales)
// ---------------------------------------------------------------------------
function pintarDonut(filas) {
    const anillo = $('anilloPrioridad');
    const valor = $('donaValor');
    const etiqueta = $('donaEtiqueta');
    const leyenda = $('leyendaPrioridad');

    const acumulado = {};
    (filas || []).forEach(f => {
        const clave = ALIAS_PRIORIDAD[f.prioridad] || f.prioridad || 'SIN CLASIFICAR';
        acumulado[clave] = (acumulado[clave] || 0) + (parseInt(f.cantidad, 10) || 0);
    });

    const grupos = ORDEN_PRIORIDAD.filter(p => acumulado[p] > 0).map(p => ({ nombre: p, cantidad: acumulado[p] }));
    const total = grupos.reduce((a, g) => a + g.cantidad, 0);

    if (!total) {
        anillo.style.background = 'conic-gradient(#e3e9f4 0 100%)';
        valor.textContent = '--';
        etiqueta.textContent = 'Sin datos';
        leyenda.innerHTML = '<li style="color:var(--suave)">Sin turnos registrados</li>';
        return;
    }

    let acumuladoPct = 0;
    const paradas = grupos.map(g => {
        const desde = acumuladoPct / total * 100;
        acumuladoPct += g.cantidad;
        const hasta = acumuladoPct / total * 100;
        return `${COLOR_PRIORIDAD[g.nombre]} ${desde.toFixed(2)}% ${hasta.toFixed(2)}%`;
    });
    anillo.style.background = `conic-gradient(${paradas.join(',')})`;

    const principal = grupos.slice().sort((a, b) => b.cantidad - a.cantidad)[0];
    valor.textContent = Math.round(principal.cantidad / total * 100) + '%';
    etiqueta.textContent = nombrePrioridad(principal.nombre);

    leyenda.innerHTML = grupos.map(g => {
        const pct = Math.round(g.cantidad / total * 100);
        return `<li style="--c:${COLOR_PRIORIDAD[g.nombre]}">${esc(nombrePrioridad(g.nombre))}<span>${pct}%</span></li>`;
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
        svg.innerHTML = '<text x="210" y="85" text-anchor="middle" font-size="12" fill="#5d6c87">Sin turnos registrados</text>';
        return;
    }

    const X0 = 30, X1 = 410, Y0 = 20, Y1 = 140;
    const max = Math.max(...porHora);
    const px = h => X0 + (X1 - X0) * h / 23;
    const py = v => Y1 - (Y1 - Y0) * v / max;

    let rejilla = '';
    for (let i = 0; i <= 4; i++) {
        const y = Y0 + (Y1 - Y0) * i / 4;
        const val = Math.round(max * (1 - i / 4));
        rejilla += `<line x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke="#e3e9f4"/>`;
    }

    const puntos = porHora.map((v, h) => `${px(h).toFixed(1)},${py(v).toFixed(1)}`).join(' ');

    const horas = [0, 4, 8, 12, 16, 20].map(h => `<text x="${px(h).toFixed(1)}" y="160" text-anchor="middle" font-size="10" fill="#5d6c87">${String(h).padStart(2,'0')}:00</text>`).join('');

    svg.innerHTML = `
        ${rejilla}
        <polyline fill="rgba(125,195,250,.18)" stroke="none" points="${puntos} ${X1},${Y1} ${X0},${Y1}"/>
        <polyline fill="none" stroke="var(--navy2)" stroke-width="3" points="${puntos}"/>
        ${horas}
        <g font-size="10" fill="#14264a">
            <circle cx="20" cy="10" r="4" fill="var(--navy2)"/>
            <text x="28" y="13">Turnos registrados · total ${total}</text>
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
        const recientes = (turnos || []).slice().sort((a, b) => fechaReferencia(b) - fechaReferencia(a)).slice(0, 3);
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
// 6. Alertas (badge de la campana)
// ---------------------------------------------------------------------------
async function cargarAlertas() {
    try {
        const d = await getJSON('/api/kpis/alertas');
        const total = parseInt(d.total, 10) || 0;
        const badge = $('alertasCount');
        if (!badge) return;
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

// Cargar gráficos una vez (y al cambiar filtro de fecha si existiera)
async function cargarGraficos() {
    try {
        const hoy = new Date();
        const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
        const [prioridades, horas] = await Promise.all([
            getJSON('/api/kpis/prioridad'),
            getJSON('/api/kpis/tendencia-hora')
        ]);
        pintarDonut(prioridades);
        pintarLinea(horas);
    } catch {}
}
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
// Importar Matriz de Turnos (CSV/Excel) — botón en el header
// ---------------------------------------------------------------------------
const btnImportarMatriz = $('btnImportarMatriz');
const inputMatrizMenu = $('fileMatrizMenu');
const msgMatriz = $('msgMatriz');
const textoBtnMatriz = $('textoBtnMatriz');
let temporizadorMsg = null;

btnImportarMatriz.addEventListener('click', (e) => {
    e.preventDefault();
    if (btnImportarMatriz.classList.contains('ocupado')) return;
    inputMatrizMenu.click();
});

inputMatrizMenu.addEventListener('change', async (e) => {
    const archivo = e.target.files[0] || null;
    if (!archivo) return;
    await subirMatriz(archivo);
    inputMatrizMenu.value = '';
});

function mostrarMensajeMatriz(clase, texto, ms) {
    clearTimeout(temporizadorMsg);
    msgMatriz.className = 'msg-matriz ' + clase;
    msgMatriz.textContent = texto;
    if (ms) temporizadorMsg = setTimeout(() => { msgMatriz.className = 'msg-matriz'; }, ms);
}

async function subirMatriz(archivo) {
    mostrarMensajeMatriz('cargando', 'Subiendo ' + archivo.name + '…');
    btnImportarMatriz.classList.add('ocupado');
    textoBtnMatriz.textContent = 'Subiendo…';
    try {
        const formData = new FormData();
        formData.append('archivo', archivo);
        const r = await fetch('/api/matriz/importar', { method: 'POST', body: formData });
        const d = await r.json();
        if (d.success) {
            mostrarMensajeMatriz('ok', d.mensaje, 5000);
            await Promise.allSettled([cargarKPIs(), cargarResumen(), cargarAlertas(), cargarRecientes(), cargarGraficos()]);
        } else {
            mostrarMensajeMatriz('error', d.error || 'Error al importar', 6000);
        }
    } catch (err) {
        mostrarMensajeMatriz('error', 'Error de conexión al subir la matriz.', 6000);
    } finally {
        btnImportarMatriz.classList.remove('ocupado');
        textoBtnMatriz.textContent = 'Subir matriz ↑';
    }
}

function marcarConexion() {
    }