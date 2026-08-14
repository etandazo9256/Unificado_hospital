const API_URL = '';
let socket;
let currentTurnoId = null;
let videoTimeout = null;
let currentCall = null;
let proximos = [];
let ultimoTiempoPromedio = 8;
let ultimoLambda = 0;
let ultimosConsultorios = 1;
let intervaloEspera = null;

const VIDEOS = ['video2.mp4', 'video3.mp4', 'video4.mp4', 'video5.mp4'];
let videoIndex = 0;

const PRIORIDAD_COLORS = {
    'ROJO': 'pri-rojo',
    'NARANJA': 'pri-naranja',
    'AMARILLO': 'pri-amarillo',
    'VERDE': 'pri-verde',
    'AZUL': 'pri-azul',
    'P1-RESUCITACION': 'pri-rojo',
    'P2-EMERGENCIA': 'pri-naranja',
    'P3-URGENCIA': 'pri-amarillo',
    'P4-MENOS_URGENTE': 'pri-verde',
    'P5-NO_URGENTE': 'pri-azul',
    'SIN CLASIFICAR': 'pri-sin-clasificar'
};

// ---- Reloj ----
function actualizarReloj() {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-EC', { hour12: false });
    const fecha = ahora.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('reloj').innerHTML = `${hora}<br><span class="reloj-fecha">${fecha}</span>`;
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

// ---- Formatear tiempo ----
function formatearTiempo(minutos) {
    if (minutos < 1) return 'Espera estimada: 5 min';
    if (minutos < 60) return `Espera estimada: ${Math.round(minutos)} min`;
    const h = Math.floor(minutos / 60);
    const m = Math.round(minutos % 60);
    return m > 0 ? `Espera estimada: ${h} h ${m} min` : `Espera estimada: ${h} h`;
}

function horasAMin(h) { return Math.round(h * 60); }

// ---- Modelo de colas M/M/c (Erlang C) con prioridad Manchester ----
function factorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

function erlangB(c, a) {
    let sum = 0;
    for (let k = 0; k < c; k++) sum += Math.pow(a, k) / factorial(k); // solo hasta k < c
    const termC = Math.pow(a, c) / factorial(c);
    return termC / (sum + termC);
}

function erlangC(c, lam, mu) {
    const rho = lam / (c * mu);
    if (rho >= 1) return 1; // colapso real, no un valor arbitrario
    const a = lam / mu;
    const B = erlangB(c, a);
    return B / (1 - rho * (1 - B)); // B calculado una sola vez
}

function wqPromedio(c, lam, mu) { return erlangC(c, lam, mu) / (c * mu - lam); }

function wqPorPrioridad(c, mu, lambdasClase) {
    const lamTotal = lambdasClase.reduce((s, v) => s + v, 0);
    const wqBase = wqPromedio(c, lamTotal, mu);
    const res = []; let ac = 0, sp = 0;
    for (const lk of lambdasClase) {
        ac += lk; const sk = ac / (c * mu);
        const denom = (1 - sp) * (1 - sk);
        res.push(denom > 0.001 ? wqBase / denom : 999 / 60);
        sp = sk;
    }
    return res;
}

// REVISAR: este factor multiplica ultimoLambda (que ya viene del backend,
// presumiblemente en tiempo real). Si stats.lambda ya refleja el tráfico
// actual, este ajuste podría estar duplicando el efecto de "hora pico".
// Confirmar si stats.lambda es un promedio histórico fijo o dinámico.
function factorPico() {
    const h = new Date().getHours();
    if ((h >= 7 && h < 9) || (h >= 12 && h < 14) || (h >= 17 && h < 20)) return 1.8;
    return 0.6;
}

function minTranscurridos(fechaISO) {
    if (!fechaISO) return 0;
    return (Date.now() - new Date(fechaISO).getTime()) / 60000;
}

// Normalizar prioridad al sistema ROJO/NARANJA/AMARILLO/VERDE/AZUL
function normalizarPrioridad(p) {
    const map = {
        'P1-RESUCITACION': 'ROJO',
        'P2-EMERGENCIA': 'NARANJA',
        'P3-URGENCIA': 'AMARILLO',
        'P4-MENOS_URGENTE': 'VERDE',
        'P5-NO_URGENTE': 'AZUL'
    };
    return map[p] || p || 'SIN CLASIFICAR';
}

// Tiempo de consulta estimado (minutos) según el área de atención
const AREA_CONSULTA_MIN = {
    'Cardiología': 20,
    'Pediatría': 15,
    'Ginecología': 20,
    'Medicina Interna': 15,
    'Emergencia': 10,
    'Nutricionista': 20,
    'Cirugía General': 25,
    'Neurología': 20,
    'Traumatología': 20,
    'Dermatología': 15
};

// Tiempo restante estimado para un paciente
function calcularEspera(p, index, totalPendientes, tiempoPromedio, lista) {
    const prioNorm = normalizarPrioridad(p.prioridad);
    if (prioNorm === 'ROJO') return 0;

    lista = lista || proximos;
    const topes = { 'ROJO': 0, 'NARANJA': 10, 'AMARILLO': 60, 'VERDE': 120, 'AZUL': 240 };

    // Base: tope máximo Manchester de su prioridad
    let espera = topes[prioNorm] || 60;

    // Cada paciente de la MISMA prioridad que está delante suma el
    // tiempo de consulta del área a la que va a atender
    const mismoPrio = lista.filter(p2 => normalizarPrioridad(p2.prioridad) === prioNorm);
    const pos = mismoPrio.indexOf(p);
    for (let i = 0; i < pos; i++) {
        const area = (mismoPrio[i].consultorio || '').trim();
        espera += AREA_CONSULTA_MIN[area] || 15;
    }

    return espera;
}

// ---- Actualizar tiempos de espera ----
function actualizarEspera() {
    const cards = document.querySelectorAll('.turno-card');
    cards.forEach((card, i) => {
        const p = proximos[i];
        const prioNorm = normalizarPrioridad(p?.prioridad);
        if (!p || prioNorm === 'ROJO') return;
        const espera = calcularEspera(p, i, proximos.length, ultimoTiempoPromedio, proximos);
        const span = card.querySelector('.card-espera');
        if (span) span.textContent = formatearTiempo(espera);
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
        ultimoLambda = data.stats?.lambda || 0;
        ultimosConsultorios = data.stats?.consultorios || 1;

        mostrarLlamado(data.turnoActual);
        renderProximos(data.proximos, data.stats?.tiempoPromedio);
        actualizarStats(data.stats);
        actualizarEsperaPrioridad(data.esperaPrioridad);
    } catch (e) {
        console.error('Error al cargar sala:', e);
    }
}

// Objetivo de tiempo máximo (Manchester) por prioridad en minutos
const OBJETIVO_PRIORIDAD_MIN = {
    'ROJO': 0, 'NARANJA': 10, 'AMARILLO': 60, 'VERDE': 120, 'AZUL': 240
};

function normalizarPrioParaStats(p) {
    const map = {
        'P1-RESUCITACION': 'ROJO',
        'P2-EMERGENCIA': 'NARANJA',
        'P3-URGENCIA': 'AMARILLO',
        'P4-MENOS_URGENTE': 'VERDE',
        'P5-NO_URGENTE': 'AZUL'
    };
    return map[p] || p;
}

function formatearMin(num) {
    if (num === 0 || num === undefined || num === null) return '0';
    if (num < 60) return Math.round(num);
    const h = Math.floor(num / 60);
    const m = Math.round(num % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function actualizarEsperaPrioridad(lista) {
    const valores = {};
    (lista || []).forEach(r => {
        const p = normalizarPrioParaStats(r.prioridad);
        valores[p] = r.esperaPromedioMin;
    });

    const orden = ['ROJO', 'NARANJA', 'AMARILLO', 'VERDE', 'AZUL'];
    const sufijos = { 'ROJO': 'Rojo', 'NARANJA': 'Naranja', 'AMARILLO': 'Amarillo', 'VERDE': 'Verde', 'AZUL': 'Azul' };

    orden.forEach(p => {
        const objEl = document.getElementById(`prioObj${sufijos[p]}`);
        const realEl = document.getElementById(`prioReal${sufijos[p]}`);
        if (objEl) objEl.textContent = OBJETIVO_PRIORIDAD_MIN[p];
        if (realEl) realEl.textContent = formatearMin(valores[p]);
    });
}

function maskCedula(val) {
    if (!val || typeof val !== 'string') return 'Sin identificar';
    const nums = val.replace(/\D/g, '');
    if (nums.length >= 10) {
        return nums.slice(0, 3) + 'xxxxx' + nums.slice(-2);
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
        'ROJO':    { bg: 'linear-gradient(145deg, #7F1D1D 0%, #EF4444 100%)' },
        'NARANJA': { bg: 'linear-gradient(145deg, #9A3412 0%, #F97316 100%)' },
        'AMARILLO':{ bg: 'linear-gradient(145deg, #92400E 0%, #F59E0B 100%)' },
        'VERDE':   { bg: 'linear-gradient(145deg, #064E3B 0%, #10B981 100%)' },
        'AZUL':    { bg: 'linear-gradient(145deg, #0B2F5C 0%, #2E86C1 100%)' }
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

    const prioNorm = normalizarPrioridad(turno.prioridad);

    // FIX: antes, si era el mismo turno (p. ej. un rellamado) solo se
    // actualizaba el color de fondo y no se restauraba la vista del
    // paciente si ya había cambiado al video. Ahora, si la pantalla ya
    // está en modo video, se vuelve a mostrar el panel del paciente y se
    // reinicia el timeout de 10s, igual que en una llamada nueva.
    if (currentTurnoId === turno.id) {
        const estilo = prioridadBg[prioNorm];
        panel.style.background = estilo ? estilo.bg : '';

        if (video.style.display !== 'none') {
            clearTimeout(videoTimeout);
            video.style.display = 'none';
            if (videoEl) videoEl.pause();

            content.style.display = 'block';
            content.style.animation = 'none';
            void content.offsetHeight;
            content.style.animation = 'fadeInUp 0.6s ease';

            videoTimeout = setTimeout(() => {
                content.style.display = 'none';
                video.style.display = 'flex';
                if (videoEl) {
                    if (!videoEl.src) videoEl.src = VIDEOS[0];
                    videoEl.play().catch(() => {});
                }
            }, 10000);
        }
        return;
    }

    clearTimeout(videoTimeout);

    panel.classList.remove('sin-turno');
    btnRellamar.style.display = 'block';
    btnRellamar.textContent = `${turno.turno}`;

    const estilo = prioridadBg[prioNorm];
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
        const prioNorm = normalizarPrioridad(p.prioridad);
        const colorClass = PRIORIDAD_COLORS[p.prioridad] || PRIORIDAD_COLORS[prioNorm] || '';

        const card = document.createElement('div');
        card.className = `turno-card ${colorClass}`;
        card.onclick = () => llamarTurno(p.id);
        const tiempoHTML = prioNorm === 'ROJO'
            ? '<div class="card-espera" style="font-weight:800;">Atención inmediata</div>'
            : `<div class="card-espera">${formatearTiempo(espera)}</div>`;
        card.innerHTML = `
            <div class="card-turno">${p.turno}</div>
            <div class="card-info">
                <div class="card-paciente">${maskCedula(p.paciente)}</div>
                <div class="card-especialidad">${p.consultorio || ''}</div>
                ${tiempoHTML}
            </div>
        `;
        container.appendChild(card);
    });

    intervaloEspera = setInterval(actualizarEspera, 60000);
}

// ---- Actualizar estadísticas ----
function actualizarStats(stats) {
    if (!stats) return;
    document.getElementById('statPendientes').textContent = stats.pendientes || 0;
    document.getElementById('statTriage').textContent = stats.enTriage || 0;
    document.getElementById('statConsulta').textContent = stats.enConsulta || 0;
    document.getElementById('statAtendidos').textContent = stats.atendidos || 0;

    // Tiempo promedio basado en el tiempo estimado de los próximos turnos
    if (proximos && proximos.length > 0) {
        const total = proximos.reduce((sum, p, i) => sum + calcularEspera(p, i, proximos.length, ultimoTiempoPromedio, proximos), 0);
        const promedio = Math.round(total / proximos.length);
        document.getElementById('statPromedio').textContent = promedio;
    } else {
        document.getElementById('statPromedio').textContent = 0;
    }
}

// ---- Llamar turno (click en tarjeta) ----
async function llamarTurno(id) {
    if (typeof reproducirSonidoLlamada === 'function') reproducirSonidoLlamada();
    try {
        const res = await fetch(`${API_URL}/api/turnos/${id}/llamar`, { method: 'POST' });
        const data = await res.json();
        if (data.success && typeof reproducirVozLlamada === 'function') {
            reproducirVozLlamada(data.turno.turno, data.turno.paciente);
        }
    } catch (e) {
        console.error('Error al llamar turno:', e);
    }
}

// ---- Rellamar ----
async function rellamar() {
    if (!currentTurnoId) return;
    if (typeof reproducirSonidoLlamada === 'function') reproducirSonidoLlamada();
    try {
        const res = await fetch(`${API_URL}/api/turnos/${currentTurnoId}/rellamar`, { method: 'POST' });
        const data = await res.json();
        if (data.success && typeof reproducirVozLlamada === 'function') {
            reproducirVozLlamada(data.turno.turno, data.turno.paciente);
        }
    } catch (e) {
        console.error('Error al rellamar:', e);
    }
}

// ---- Inicialización ----
document.addEventListener('DOMContentLoaded', function () {
    cargarSala();

    socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => actualizarConexion(true));
    socket.on('disconnect', () => actualizarConexion(false));
    socket.on('connect_error', () => actualizarConexion(false));

    socket.on('turno:llamado',          () => cargarSala());
    socket.on('turno:rellamado',        () => cargarSala());
    socket.on('turno:en_triage',        () => cargarSala());
    socket.on('turno:pendiente_medico', () => cargarSala());
    socket.on('turno:en_atencion',      () => cargarSala());
    socket.on('turno:finalizado',       () => cargarSala());
    socket.on('turno:no_asiste',        () => cargarSala());
    socket.on('turno:cancelado',        () => cargarSala());
    socket.on('turno:reiniciado',       () => cargarSala());

    // Refresco automático periódico: cualquier cambio en la BD
    // (incluido un UPDATE hecho directamente con SQL) se refleja
    // en la sala de espera sin necesidad de recargar la página.
    setInterval(cargarSala, 15000);

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
