/* ============================================================================
   Menú principal — lógica adaptada al sistema unificado
   - Reloj / fecha del pie
   - KPIs, dona de prioridades, turnos por hora y resumen  -> API real
   - Tiempo de espera promedio por prioridad Manchester -> API real
   - Estado de conexión + Socket.IO (refresco instantáneo)
   - Botón Importar Matriz (CSV/Excel) como tarjeta separada
   ========================================================================== */

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
    return r.json();
}

function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

const OBJETIVO_PRIORIDAD_MIN = { ROJO: 0, NARANJA: 10, AMARILLO: 60, VERDE: 120, AZUL: 240 };

function formatearMin(min) {
    const n = Number(min);
    if (!Number.isFinite(n) || n <= 0) return '0 min';
    if (n < 60) return `${Math.round(n)} min`;
    const h = Math.floor(n / 60);
    const m = Math.round(n % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
// Conexión
// ---------------------------------------------------------------------------
let conectado = true;
function marcarConexion(ok) {
    if (ok === conectado) return;
    conectado = ok;
    const dot = $('connDot');
    const txt = $('connText');
    if (dot && txt) {
        dot.classList.toggle('off', !ok);
        txt.textContent = ok ? 'Conectado' : 'Desconectado';
        $('chipConexion').title = ok
            ? 'Conectado al servidor de turnos'
            : 'Sin conexión con el servidor de turnos';
    }
}

// ---------------------------------------------------------------------------
// 1. KPIs de la sala (misma API que la pantalla de Sala de Espera)
// ---------------------------------------------------------------------------
async function cargarSala() {
    try {
        const d = await getJSON('/api/turnos/sala');
        const s = d.stats || {};
        $('kpiAtendidos').textContent = numero(s.atendidos);
        $('kpiPendientes').textContent = numero(s.pendientes);
        $('kpiTriage').textContent = numero(s.enTriage);
        $('kpiPromedio').textContent = numero(s.tiempoPromedio);
        $('kpiConsulta').textContent = numero(s.enConsulta);
        $('kpiLlegadas').textContent = numero(s.lambda);
        $('kpiConsultorios').textContent = numero(s.consultorios);
        pintarEsperaPrioridad(d.esperaPrioridad);
        marcarConexion(true);
    } catch {
        marcarConexion(false);
    }
}

// ---------------------------------------------------------------------------
// 2. Dona de prioridades Manchester
// ---------------------------------------------------------------------------
function pintarDona(filas) {
    const anillo = $('anilloPrioridad');
    const leyenda = $('leyendaPrioridad');
    const valor = $('donaValor');
    const etiqueta = $('donaEtiqueta');

    const acumulado = {};
    (filas || []).forEach(f => {
        const clave = ALIAS_PRIORIDAD[f.prioridad] || f.prioridad || 'SIN CLASIFICAR';
        acumulado[clave] = (acumulado[clave] || 0) + (parseInt(f.cantidad, 10) || 0);
    });

    const grupos = ORDEN_PRIORIDAD
        .filter(p => acumulado[p] > 0)
        .map(p => ({ nombre: p, cantidad: acumulado[p] }));

    const total = grupos.reduce((a, g) => a + g.cantidad, 0);

    if (!total) {
        anillo.style.background = 'conic-gradient(#e3e9f4 0 100%)';
        valor.textContent = '--';
        etiqueta.textContent = 'Sin datos';
        leyenda.innerHTML = '<li class="sin-datos">Sin turnos registrados</li>';
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
// 3. Gráfico de turnos por hora (SVG generado con datos reales)
// ---------------------------------------------------------------------------
function pintarGraficoHoras(filas) {
    const svg = $('graficoHoras');

    const porHora = new Array(24).fill(0);
    (filas || []).forEach(f => {
        const h = parseInt(f.hora, 10);
        if (h >= 0 && h < 24) porHora[h] = parseInt(f.cantidad, 10) || 0;
    });

    const total = porHora.reduce((a, b) => a + b, 0);
    if (!total) {
        svg.innerHTML = '<text x="210" y="110" text-anchor="middle" font-size="12" fill="#5d6c87">Sin turnos registrados</text>';
        return;
    }

    const X0 = 38, X1 = 408, Y0 = 26, Y1 = 185;
    const max = Math.max(...porHora);
    const px = h => X0 + (X1 - X0) * h / 23;
    const py = v => Y1 - (Y1 - Y0) * v / max;

    const puntos = porHora.map((v, h) => `${px(h).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
    const area = `${X0},${Y1} ${puntos} ${X1},${Y1}`;

    let rejilla = '';
    for (let i = 0; i <= 4; i++) {
        const y = Y0 + (Y1 - Y0) * i / 4;
        const val = Math.round(max * (1 - i / 4));
        rejilla += `<line x1="${X0}" y1="${y}" x2="${X1}" y2="${y}" stroke="#e3e9f4"/>`;
        rejilla += `<text x="${X0 - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#5d6c87">${val}</text>`;
    }

    const horasMarcadas = [0, 4, 8, 12, 16, 20]
        .map(h => `<text x="${px(h).toFixed(1)}" y="205" text-anchor="middle" font-size="9" fill="#5d6c87">${String(h).padStart(2, '0')}:00</text>`)
        .join('');

    svg.innerHTML = `
        ${rejilla}
        <polygon points="${area}" fill="rgba(125,195,250,.18)"/>
        <polyline points="${puntos}" fill="none" stroke="var(--navy2)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${horasMarcadas}
        <g font-size="10" fill="#14264a">
            <circle cx="${X0}" cy="12" r="4" fill="var(--navy2)"/>
            <text x="${X0 + 8}" y="15">Turnos registrados · total ${total}</text>
        </g>`;
}

// ---------------------------------------------------------------------------
// 4. Resumen + período (hoy; si no hay datos de hoy, histórico general)
// ---------------------------------------------------------------------------
async function cargarPanel() {
    try {
        const hoy = hoyISO();
        let res = await getJSON(`/api/kpis/resumen?fechaInicio=${hoy}&fechaFin=${hoy}`);
        let periodo = '';
        let etiquetaPeriodo = 'Hoy';

        if ((res.total_pacientes || 0) === 0) {
            res = await getJSON('/api/kpis/resumen');
            etiquetaPeriodo = 'General';
        } else {
            periodo = `?fechaInicio=${hoy}&fechaFin=${hoy}`;
        }

        $('chipPeriodo').textContent = etiquetaPeriodo;
        $('resumenTitulo').textContent = etiquetaPeriodo === 'Hoy' ? 'Resumen del día' : 'Resumen general';
        $('resTotal').textContent = numero(res.total_pacientes);
        $('resAtendidos').textContent = numero(res.total_atendidos);
        $('resPendientes').textContent = numero(res.total_pendientes);

        const [prioridades, horas] = await Promise.all([
            getJSON('/api/kpis/prioridad' + periodo),
            getJSON('/api/kpis/tendencia-hora' + periodo)
        ]);

        pintarDona(prioridades);
        pintarGraficoHoras(horas);
        marcarConexion(true);
    } catch {
        marcarConexion(false);
    }
}

// ---------------------------------------------------------------------------
// 5. Tiempo de espera promedio por prioridad Manchester
// ---------------------------------------------------------------------------
function pintarEsperaPrioridad(filas) {
    const acumulado = {};
    (filas || []).forEach(f => {
        const clave = ALIAS_PRIORIDAD[f.prioridad] || f.prioridad || 'SIN CLASIFICAR';
        if (!acumulado[clave]) acumulado[clave] = { cantidad: 0, espera: 0, total: 0 };
        const cant = parseInt(f.cantidad, 10) || 0;
        const espera = parseFloat(f.esperaPromedioMin);
        acumulado[clave].cantidad += cant;
        if (Number.isFinite(espera)) acumulado[clave].espera += espera * cant;
        acumulado[clave].total += cant;
    });

    const IDS = { ROJO: 'esperaRojo', NARANJA: 'esperaNaranja', AMARILLO: 'esperaAmarillo', VERDE: 'esperaVerde', AZUL: 'esperaAzul' };
    ORDEN_PRIORIDAD.forEach(p => {
        if (p === 'SIN CLASIFICAR' || !IDS[p]) return;
        const el = $(IDS[p]);
        if (!el) return;
        const g = acumulado[p];
        if (!g || !g.cantidad) return;
        const promedio = g.espera / g.cantidad;
        el.textContent = formatearMin(promedio);
    });
}

// ---------------------------------------------------------------------------
// Refresco periódico
// ---------------------------------------------------------------------------
async function refrescarTodo() {
    await Promise.allSettled([cargarSala(), cargarPanel()]);
}

refrescarTodo();
setInterval(cargarSala, 15000);
setInterval(cargarPanel, 60000);

// ---------------------------------------------------------------------------
// Socket.IO: refresco instantáneo cuando ocurre un evento de turnos
// ---------------------------------------------------------------------------
let temporizadorRefresco = null;
function refrescarPronto() {
    if (temporizadorRefresco) return;
    temporizadorRefresco = setTimeout(() => {
        temporizadorRefresco = null;
        Promise.allSettled([cargarSala(), cargarPanel()]);
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
    } catch {
        /* Sin Socket.IO el menú sigue funcionando con el sondeo periódico */
    }
}

// ---------------------------------------------------------------------------
// Importar Matriz de Turnos (tarjeta separada en el menú)
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
