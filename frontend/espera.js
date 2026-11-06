const API_URL = '';

// ---- Reloj y conexión ----
function actualizarReloj() {
    const ahora = new Date();
    document.getElementById('reloj').innerText = ahora.toLocaleTimeString('es-EC', { hour12: false });
}
setInterval(actualizarReloj, 1000);
actualizarReloj();

function actualizarConexion(conectado) {
    const dot = document.getElementById('connDot');
    if (dot) dot.classList.toggle('disconnected', !conectado);
}

// ---- Socket.IO: actualización en tiempo real ----
function conectarSocket() {
    if (typeof io === 'undefined') return;
    const socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socket.on('connect', () => actualizarConexion(true));
    socket.on('disconnect', () => actualizarConexion(false));
    socket.on('connect_error', () => actualizarConexion(false));
    socket.on('turno:llamado',          cargarEspera);
    socket.on('turno:rellamado',        cargarEspera);
    socket.on('turno:en_triage',        cargarEspera);
    socket.on('turno:pendiente_medico', cargarEspera);
    socket.on('turno:en_atencion',      cargarEspera);
    socket.on('turno:finalizado',       cargarEspera);
    socket.on('turno:no_asiste',        cargarEspera);
    socket.on('turno:cancelado',        cargarEspera);
    socket.on('turno:reiniciado',       cargarEspera);
}

// ---- Normalización y tiempos ----
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

const TOPES_PRIORIDAD_MIN = {
    'ROJO': 0, 'NARANJA': 10, 'AMARILLO': 60, 'VERDE': 120, 'AZUL': 240
};

// Misma lógica que la sala de espera: tope Manchester +
// tiempo de consulta por cada paciente de la misma prioridad que va delante
function calcularEspera(p, lista) {
    const prio = normalizarPrioridad(p.prioridad);
    if (prio === 'ROJO') return 0;

    let espera = TOPES_PRIORIDAD_MIN[prio] || 60;
    const mismos = lista.filter(x => normalizarPrioridad(x.prioridad) === prio);
    const pos = mismos.indexOf(p);
    for (let i = 0; i < pos; i++) {
        const area = (mismos[i].consultorio || '').trim();
        espera += AREA_CONSULTA_MIN[area] || 15;
    }
    return espera;
}

function formatearTiempo(min) {
    if (min === undefined || min === null) return '--';
    if (min === 0) return '0 min';
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

// ---- Carga de datos ----
const IDS_PRIORIDAD = {
    'ROJO': 'tiempoRojo',
    'NARANJA': 'tiempoNaranja',
    'AMARILLO': 'tiempoAmarillo',
    'VERDE': 'tiempoVerde',
    'AZUL': 'tiempoAzul'
};

async function cargarEspera() {
    try {
        const res = await fetch(`${API_URL}/api/turnos/sala`);
        const data = await res.json();
        if (!data.success) return;

       
        const proximos = data.proximos || [];
        Object.keys(IDS_PRIORIDAD).forEach(prio => {
            const deEstaPrio = proximos.filter(x => normalizarPrioridad(x.prioridad) === prio);
            const ultimo = deEstaPrio[deEstaPrio.length - 1];
            const el = document.getElementById(IDS_PRIORIDAD[prio]);
            if (!el) return;
            if (!ultimo) {
                el.textContent = 'Sin espera';
            } else {
                el.textContent = formatearTiempo(calcularEspera(ultimo, proximos));
            }
        });
    } catch (e) {
        console.error('Error al cargar espera:', e);
        actualizarConexion(false);
    }
}

cargarEspera();
setInterval(cargarEspera, 15000);
conectarSocket();
