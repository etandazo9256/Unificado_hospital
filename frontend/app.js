const API_URL = window.location.origin;
let socket;
let currentTurnoId = null;
let videoTimeout = null;
let currentCall = null;
let proximos = [];
let ultimoTiempoPromedio = 8;
let ultimoLambda = 0;
let ultimosConsultorios = 1;
let intervaloEspera = null;

// Definición oficial de topes de tiempo Manchester (en minutos)
// Estos son los tiempos MÁXIMOS permitidos por prioridad antes de atención médica
const MANCHESTER_TOPES = {
    'ROJO':    { minutos: 0,   label: 'Inmediato',  icono: '🔴' },
    'NARANJA': { minutos: 10,  label: '≤ 10 min',   icono: '🟠' },
    'AMARILLO':{ minutos: 60,  label: '≤ 60 min',   icono: '🟡' },
    'VERDE':   { minutos: 120, label: '≤ 120 min',  icono: '🟢' },
    'AZUL':    { minutos: 240, label: '≤ 240 min',  icono: '🔵' }
};

const VIDEOS = ['video2.mp4', 'video3.mp4', 'video4.mp4', 'video5.mp4'];
let videoIndex = 0;

const PRIORIDAD_COLORS = {
    'ROJO': 'pri-rojo',
    'NARANJA': 'pri-naranja',
    'AMARILLO': 'pri-amarillo',
    'VERDE': 'pri-verde',
    'AZUL': 'pri-azul',
    'SIN CLASIFICAR': 'pri-sin-clasificar'
};

// ---- Reloj ----
function actualizarReloj() {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-EC', { hour12: false });
    const fecha = ahora.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('reloj').innerHTML = `${hora}<br><span style="font-size:12px;font-weight:500;opacity:0.7;letter-spacing:0.3px;text-transform:capitalize;">${fecha}</span>`;
}

// ---- Conexión ----
function actualizarConexion(conectado) {
    const dot = document.getElementById('connDot');
    const text = document.getElementById('connText');
    if (dot && text) {
        dot.classList.toggle('disconnected', !conectado);
        text.textContent = conectado ? 'Conectado' : 'Desconectado';
    }
}

// ---- Formatear tiempo estimado ----
function formatearTiempo(minutos) {
    if (minutos < 1) return 'Espera: ~1 min';
    if (minutos < 60) return `Espera: ~${Math.round(minutos)} min`;
    const h = Math.floor(minutos / 60);
    const m = Math.round(minutos % 60);
    return m > 0 ? `Espera: ~${h} h ${m} min` : `Espera: ~${h} h`;
}

// ---- Formatear tiempo transcurrido desde fecha_turno ----
function formatearTranscurrido(fechaISO) {
    if (!fechaISO) return null;
    const diff = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 60000);
    if (diff < 1) return '< 1 min';
    if (diff < 60) return `${diff} min`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

// ---- Minutos transcurridos desde fecha ----
function minutosTranscurridos(fechaISO) {
    if (!fechaISO) return 0;
    return Math.floor((Date.now() - new Date(fechaISO).getTime()) / 60000);
}

function horasAMin(h) { return Math.round(h * 60); }

// ---- Modelo de colas M/M/c (Erlang C) con prioridad Manchester ----
function factorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

function erlangB(c, a) {
    let sum = 0;
    for (let k = 0; k <= c; k++) sum += Math.pow(a, k) / factorial(k);
    return (Math.pow(a, c) / factorial(c)) / sum;
}

function erlangC(c, lam, mu) {
    const rho = lam / (c * mu);
    if (rho >= 1) return 0.95;
    return erlangB(c, lam / mu) / (1 - rho * (1 - erlangB(c, lam / mu)));
}

function wqPromedio(c, lam, mu) { return erlangC(c, lam, mu) / (c * mu - lam); }

function wqPorPrioridad(c, mu, lambdasClase) {
    const lamTotal = lambdasClase.reduce((s, v) => s + v, 0);
    const wqBase = wqPromedio(c, lamTotal, mu);
    const res = []; let ac = 0, sp = 0;
    for (const lk of lambdasClase) {
        ac += lk; const sk = ac / (c * mu);
        const denom = (1 - sp) * (1 - sk);
        res.push(denom > 0.001 ? wqBase / denom : 999);
        sp = sk;
    }
    return res;
}

function factorPico() {
    const h = new Date().getHours();
    if ((h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 17 && h < 20)) return 1.8;
    return 0.6;
}

function minTranscurridos(fechaISO) {
    if (!fechaISO) return 0;
    return (Date.now() - new Date(fechaISO).getTime()) / 60000;
}

// Tiempo restante estimado para un paciente (Erlang C + Cobham)
function calcularEspera(p, index, totalPendientes, tiempoPromedio, lista) {
    if (p.prioridad === 'ROJO') return 0;

    lista = lista || proximos;
    const ordenPrio = ['ROJO', 'NARANJA', 'AMARILLO', 'VERDE', 'AZUL'];
    const topes = { 'ROJO': 0, 'NARANJA': 10, 'AMARILLO': 60, 'VERDE': 120, 'AZUL': 240 };

    // Parámetros desde la API
    const C = ultimosConsultorios || 1;
    const lamReal = ultimoLambda || 1;
    const mu = 60 / (tiempoPromedio || 8);
    const Fp = factorPico();
    const lamActual = Math.max(lamReal * Fp, 0.5);

    // Detectar colapso
    const rho = lamActual / (C * mu);
    if (rho >= 1) return topes[p.prioridad] || 120;

    // Contar pacientes por prioridad
    const conteo = {};
    ordenPrio.forEach(o => conteo[o] = 0);
    lista.forEach(p2 => { if (conteo[p2.prioridad] !== undefined) conteo[p2.prioridad]++; });
    const totalP = lista.length || 1;

    // Distribuir λ entre las prioridades que tienen pacientes
    const lambdasClase = ordenPrio.map(o => conteo[o] > 0 ? lamActual * (conteo[o] / totalP) : 0);

    // Erlang C + Cobham
    const wqsHoras = wqPorPrioridad(C, mu, lambdasClase);
    const idxPrio = ordenPrio.indexOf(p.prioridad);
    if (idxPrio < 0 || wqsHoras[idxPrio] === undefined) return topes[p.prioridad] || 60;
    const wqMin = Math.round(wqsHoras[idxPrio] * 60);

    // Ajuste por posición dentro de su prioridad
    const mismoPrio = lista.filter(p2 => p2.prioridad === p.prioridad);
    const pos = mismoPrio.indexOf(p);
    const fraccion = mismoPrio.length > 1 ? Math.max(1 - pos / (mismoPrio.length - 1), 0.3) : 1;
    let esperaFinal = Math.round(wqMin * fraccion);

    // Piso realista: una consulta nunca dura menos de 5 min
    if (esperaFinal < 5) esperaFinal = 5;

    return Math.min(esperaFinal, topes[p.prioridad] || 120);
}

// ---- Actualizar tiempos de espera (dinámico, corre cada 30s) ----
function actualizarEspera() {
    const cards = document.querySelectorAll('.turno-card');
    cards.forEach((card, i) => {
        const p = proximos[i];
        if (!p) return;

        const tope = MANCHESTER_TOPES[p.prioridad];
        const transcurrido = minutosTranscurridos(p.fecha_turno);
        const excedido = tope && tope.minutos > 0 && transcurrido > tope.minutos;

        // Actualizar texto de espera
        if (p.prioridad === 'ROJO') {
            const span = card.querySelector('.card-espera');
            if (span) span.innerHTML = '⚡ Atención inmediata';
        } else {
            const espera = calcularEspera(p, i, proximos.length, ultimoTiempoPromedio, proximos);
            const span = card.querySelector('.card-espera');
            if (span) span.textContent = formatearTiempo(espera);
        }

        // Actualizar tiempo transcurrido real
        const spanTransc = card.querySelector('.card-transcurrido');
        if (spanTransc) spanTransc.textContent = `En espera: ${formatearTranscurrido(p.fecha_turno)}`;

        // Aplicar/quitar clase de alerta si supera el tope Manchester
        card.classList.toggle('tiempo-excedido', excedido);

        // Actualizar badge de alerta
        const badgeAlert = card.querySelector('.badge-alerta');
        if (badgeAlert) {
            badgeAlert.style.display = excedido ? 'inline-block' : 'none';
            badgeAlert.textContent = excedido ? `⚠️ Supera tope (${tope.label})` : '';
        }
    });
}

// ---- Cargar datos de sala ----
async function cargarSala() {
    try {
        const res = await fetch(`${API_URL}/api/turnos/sala`);
        const data = await res.json();
        if (!data.success) return;

        currentCall = data.turnoActual;
        proximos = data.proximos;
        ultimoLambda = data.stats.lambda || 0;
        ultimosConsultorios = data.stats.consultorios || 1;

        mostrarLlamado(data.turnoActual);
        renderProximos(data.proximos, data.stats.tiempoPromedio);
        actualizarStats(data.stats);
    } catch (e) {
        console.error('Error al cargar sala:', e);
    }
}

function maskCedula(val) {
    if (!val) return '';
    const nums = val.replace(/\D/g, '');
    if (nums.length >= 10) {
        return nums.slice(0, 2) + 'xxxxxx' + nums.slice(-2);
    }
    if (nums.length >= 4) {
        return nums.slice(0, 1) + 'xxxx' + nums.slice(-2);
    }
    return nums;
}

// ---- Mostrar paciente llamado ----
function mostrarLlamado(turno) {
    const panel = document.getElementById('callPanel');
    const content = document.getElementById('callContent');
    const video = document.getElementById('videoContainer');
    const prioridadBg = {
        'ROJO': { bg: 'linear-gradient(145deg, #7F1D1D 0%, #EF4444 100%)' },
        'NARANJA': { bg: 'linear-gradient(145deg, #9A3412 0%, #F97316 100%)' },
        'AMARILLO': { bg: 'linear-gradient(145deg, #92400E 0%, #F59E0B 100%)' },
        'VERDE': { bg: 'linear-gradient(145deg, #064E3B 0%, #10B981 100%)' },
        'AZUL': { bg: 'linear-gradient(145deg, #0B2F5C 0%, #2E86C1 100%)' }
    };

    const btnRellamar = document.getElementById('btnRellamar');
    const videoEl = document.getElementById('tvVideo');
    if (!videoEl._listenerInit) {
        videoEl._listenerInit = true;
        videoEl.addEventListener('ended', () => {
            videoIndex = (videoIndex + 1) % VIDEOS.length;
            videoEl.src = VIDEOS[videoIndex];
            videoEl.play().catch(() => {});
        });
    }

    if (!turno) {
        clearTimeout(videoTimeout);
        panel.classList.add('sin-turno');
        panel.style.background = '';
        btnRellamar.style.display = 'none';
        document.getElementById('callTurno').textContent = '---';
        document.getElementById('callPaciente').textContent = '';
        document.getElementById('callDetalles').style.display = 'none';
        document.getElementById('callHora').style.display = 'none';
        currentTurnoId = null;
        currentCall = null;
        video.style.display = 'none';
        content.style.display = 'block';
        return;
    }

    if (currentTurnoId === turno.id) {
        const estilo = prioridadBg[turno.prioridad];
        panel.style.background = estilo ? estilo.bg : '';
        return;
    }

    clearTimeout(videoTimeout);

    panel.classList.remove('sin-turno');
    btnRellamar.style.display = 'block';
    btnRellamar.textContent = `${turno.turno}`;

    const estilo = prioridadBg[turno.prioridad];
    panel.style.background = estilo ? estilo.bg : '';

    currentTurnoId = turno.id;
    document.getElementById('callTurno').textContent = turno.turno;
    document.getElementById('callDetalles').style.display = 'none';
    document.getElementById('callHora').style.display = 'none';
    document.getElementById('callPaciente').textContent = '';

    content.style.display = 'block';
    content.style.animation = 'none';
    void content.offsetHeight;
    content.style.animation = 'fadeInUp 0.6s ease';

    video.style.display = 'none';
    if (videoEl) videoEl.pause();

    videoTimeout = setTimeout(() => {
        content.style.display = 'none';
        video.style.display = 'flex';
        if (videoEl) {
            if (!videoEl.src) videoEl.src = VIDEOS[0];
            videoEl.play().catch(() => {});
        }
    }, 10000);
}

// ---- Render próximos turnos ----
function renderProximos(lista, tiempoPromedio) {
    const container = document.getElementById('proximosLista');
    ultimoTiempoPromedio = tiempoPromedio || 8;

    if (intervaloEspera) clearInterval(intervaloEspera);

    if (!lista || lista.length === 0) {
        container.innerHTML = '<div class="empty-proximos">No hay pacientes en espera</div>';
        return;
    }

    container.innerHTML = '';
    lista.forEach((p, i) => {
        const espera = calcularEspera(p, i, lista.length, ultimoTiempoPromedio, lista);
        const colorClass = PRIORIDAD_COLORS[p.prioridad] || '';
        const tope = MANCHESTER_TOPES[p.prioridad];
        const transcurrido = minutosTranscurridos(p.fecha_turno);
        const excedido = tope && tope.minutos > 0 && transcurrido > tope.minutos;

        const card = document.createElement('div');
        card.className = `turno-card ${colorClass}${excedido ? ' tiempo-excedido' : ''}`;
        card.onclick = () => llamarTurno(p.id);

        // Badge con el límite máximo Manchester
        const badgeTope = tope
            ? `<span class="badge-manchester" title="Tiempo máximo permitido por Triage Manchester">${tope.icono} ${tope.label}</span>`
            : '';

        // Badge de alerta si excede el tope
        const badgeAlert = excedido
            ? `<span class="badge-alerta">⚠️ Supera tope (${tope.label})</span>`
            : `<span class="badge-alerta" style="display:none;"></span>`;

        // Tiempo estimado de espera
        let tiempoHTML;
        if (p.prioridad === 'ROJO') {
            tiempoHTML = '<div class="card-espera">⚡ Atención inmediata</div>';
        } else {
            tiempoHTML = `<div class="card-espera">${formatearTiempo(espera)}</div>`;
        }

        // Tiempo transcurrido real desde emisión del turno
        const transcurridoHTML = p.fecha_turno
            ? `<div class="card-transcurrido">En espera: ${formatearTranscurrido(p.fecha_turno)}</div>`
            : '';

        card.innerHTML = `
            <div class="card-turno-col">
                <div class="card-turno">${p.turno}</div>
                ${badgeTope}
            </div>
            <div class="card-info">
                <div class="card-paciente">${maskCedula(p.paciente)}</div>
                <div class="card-especialidad">${p.consultorio || '&nbsp;'}</div>
                ${tiempoHTML}
                ${transcurridoHTML}
                ${badgeAlert}
            </div>
        `;
        container.appendChild(card);
    });

    // Actualizar cada 30 segundos (más reactivo que 60s)
    intervaloEspera = setInterval(actualizarEspera, 30000);
}

// ---- Actualizar estadísticas ----
function actualizarStats(stats) {
    document.getElementById('statPendientes').textContent = stats.pendientes || 0;
    document.getElementById('statTriage').textContent = stats.enTriage || 0;
    document.getElementById('statConsulta').textContent = stats.enConsulta || 0;
    document.getElementById('statAtendidos').textContent = stats.atendidos || 0;
    document.getElementById('statPromedio').textContent = stats.tiempoPromedio || 0;
    // document.getElementById('statLambda').textContent = stats.lambda || 0;
    // document.getElementById('statConsultorios').textContent = stats.consultorios || 0;
}

// ---- Llamar turno (click en tarjeta) ----
async function llamarTurno(id) {
    if (typeof sonidoChime === 'function') sonidoChime();
    try {
        const res = await fetch(`${API_URL}/api/turnos/${id}/llamar`, { method: 'POST' });
        const data = await res.json();
        if (data.success && typeof sonidoVoz === 'function') {
            sonidoVoz(data.turno.turno);
        }
    } catch (e) {
        console.error('Error al llamar turno:', e);
    }
}

// ---- Rellamar ----
async function rellamar() {
    if (!currentTurnoId) return;
    if (typeof sonidoChime === 'function') sonidoChime();
    try {
        const res = await fetch(`${API_URL}/api/turnos/${currentTurnoId}/rellamar`, { method: 'POST' });
        const data = await res.json();
        if (data.success && typeof sonidoVoz === 'function') {
            sonidoVoz(data.turno.turno);
        }
    } catch (e) {
        console.error('Error al rellamar:', e);
    }
}

// ---- Sonido ----


// ---- Inicialización ----
document.addEventListener('DOMContentLoaded', function () {
    cargarSala();

    socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => actualizarConexion(true));
    socket.on('disconnect', () => actualizarConexion(false));
    socket.on('connect_error', () => actualizarConexion(false));

    socket.on('turno:llamado', () => cargarSala());
    socket.on('turno:rellamado', () => cargarSala());
    socket.on('turno:en_triage', () => cargarSala());
    socket.on('turno:pendiente_medico', () => cargarSala());
    socket.on('turno:en_atencion', () => cargarSala());
    socket.on('turno:finalizado', () => cargarSala());
    socket.on('turno:no_asiste', () => cargarSala());
    socket.on('turno:cancelado', () => cargarSala());
    socket.on('turno:reiniciado', () => cargarSala());

    document.addEventListener('click', () => {
        if (typeof getAudioCtx === 'function') getAudioCtx();
    }, { once: true });

    setInterval(actualizarReloj, 1000);
    actualizarReloj();
});

// Keyboard shortcut: Space to rellamar
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') { e.preventDefault(); rellamar(); }
});
