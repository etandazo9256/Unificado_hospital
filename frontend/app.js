const API_URL = '';
let turnoAnterior = null;
let socket = null;
let proximosList = [];
let intervaloEspera = null;

// ============================================================
// TRIAGE MANCHESTER: Topes de tiempo máximos por prioridad
// P1=Inmediato, P2≤10min, P3≤60min, P4≤120min, P5≤240min
// ============================================================
const MANCHESTER = {
    'P1-RESUCITACION':  { minutos: 0,   label: 'Inmediato',  color: '#DC2626', texto: '#fff', icono: '🔴' },
    'P2-EMERGENCIA':    { minutos: 10,  label: '≤ 10 min',   color: '#EA580C', texto: '#fff', icono: '🟠' },
    'P3-URGENCIA':      { minutos: 60,  label: '≤ 60 min',   color: '#CA8A04', texto: '#fff', icono: '🟡' },
    'P4-MENOS_URGENTE': { minutos: 120, label: '≤ 120 min',  color: '#16A34A', texto: '#fff', icono: '🟢' },
    'P5-NO_URGENTE':    { minutos: 240, label: '≤ 240 min',  color: '#2563EB', texto: '#fff', icono: '🔵' }
};

// ---- Tiempo transcurrido desde una fecha ISO ----
function minutosDesde(fechaISO) {
    if (!fechaISO) return 0;
    return Math.floor((Date.now() - new Date(fechaISO).getTime()) / 60000);
}

function formatearEspera(minutos) {
    if (minutos < 1) return '< 1 min';
    if (minutos < 60) return `${minutos} min`;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ---- Actualizar tiempos en tarjetas cada 30 segundos ----
function actualizarTiemposEspera() {
    document.querySelectorAll('.fila-turno[data-fecha]').forEach(fila => {
        const fechaISO   = fila.dataset.fecha;
        const prioridad  = fila.dataset.prioridad;
        const manchester = MANCHESTER[prioridad];
        const trans      = minutosDesde(fechaISO);

        // Actualizar tiempo transcurrido
        const spanTrans = fila.querySelector('.turno-espera-trans');
        if (spanTrans) spanTrans.textContent = `⏱ ${formatearEspera(trans)}`;

        // Verificar si supera el tope Manchester
        const excedido = manchester && manchester.minutos > 0 && trans > manchester.minutos;
        fila.classList.toggle('tiempo-excedido', excedido);

        const spanAlerta = fila.querySelector('.turno-alerta');
        if (spanAlerta) {
            spanAlerta.style.display = excedido ? 'inline-block' : 'none';
            spanAlerta.textContent   = excedido ? `⚠ Supera ${manchester.label}` : '';
        }
    });
}

async function cargarSala() {
    try {
        const respuesta = await fetch(`${API_URL}/api/turnos/sala`);
        const data = await respuesta.json();

        if (!data.success) {
            mostrarSalaVacia();
            return;
        }

        const turnoActual = data.turnoActual;
        const proximos    = data.proximos || [];
        const enTriageCount = data.enTriageCount || 0;

        if (turnoActual) {
            if (turnoActual.turno !== turnoAnterior) {
                turnoAnterior = turnoActual.turno;
                reproducirSonidoLlamada();
                reproducirVozLlamada(turnoActual.turno, turnoActual.paciente);
            }
            document.getElementById('turnoActual').textContent = turnoActual.turno;
            document.getElementById('pacienteActual').textContent = turnoActual.paciente || '---';
            document.getElementById('displayTurno').classList.remove('sin-turnos');

            // Mostrar prioridad del turno actual en el panel principal
            const manchester = MANCHESTER[turnoActual.prioridad];
            const panelPrio  = document.getElementById('turnoActualPrioridad');
            if (panelPrio && manchester) {
                panelPrio.textContent         = `${manchester.icono} ${turnoActual.prioridad}`;
                panelPrio.style.background    = manchester.color;
                panelPrio.style.color         = manchester.texto;
                panelPrio.style.display       = 'inline-block';
            } else if (panelPrio) {
                panelPrio.style.display = 'none';
            }
        } else {
            mostrarSalaVacia();
        }

        proximosList = proximos;
        renderProximos(proximos);

        document.getElementById('enTriageCount').textContent  = enTriageCount;
        document.getElementById('pendientesCount').textContent = proximos.length;

    } catch (error) {
        console.error('Error al cargar sala:', error);
        mostrarSalaVacia();
    }
}

// ---- Render lista de próximos turnos con colores Manchester ----
function renderProximos(proximos) {
    if (intervaloEspera) clearInterval(intervaloEspera);

    const lista = document.getElementById('listaProximosTurnos');
    lista.innerHTML = '';

    if (proximos.length === 0) {
        lista.innerHTML = '<div class="fila-vacia">No hay turnos pendientes</div>';
        return;
    }

    proximos.forEach(p => {
        const manchester = MANCHESTER[p.prioridad];
        const trans      = minutosDesde(p.fecha_turno);
        const excedido   = manchester && manchester.minutos > 0 && trans > manchester.minutos;

        // Badge de prioridad con color Manchester
        const badgePrio = manchester
            ? `<span class="turno-prio-badge" style="background:${manchester.color};color:${manchester.texto};">${manchester.icono} ${p.prioridad.replace('P1-','').replace('P2-','').replace('P3-','').replace('P4-','').replace('P5-','')}</span>`
            : '<span class="turno-prio-badge" style="background:#64748B;color:#fff;">S/C</span>';

        // Badge de tope máximo Manchester
        const badgeTope = manchester
            ? `<span class="turno-tope-badge" style="border-color:${manchester.color};color:${manchester.color};">${manchester.label}</span>`
            : '';

        // Tiempo transcurrido real
        const transHTML = p.fecha_turno
            ? `<span class="turno-espera-trans">⏱ ${formatearEspera(trans)}</span>`
            : '';

        // Alerta si supera tope
        const alertaHTML = `<span class="turno-alerta" style="display:${excedido ? 'inline-block' : 'none'};">${excedido ? `⚠ Supera ${manchester?.label}` : ''}</span>`;

        const fila = document.createElement('div');
        fila.className   = `fila-turno${excedido ? ' tiempo-excedido' : ''}`;
        fila.dataset.fecha     = p.fecha_turno || '';
        fila.dataset.prioridad = p.prioridad   || '';
        fila.innerHTML = `
            <div class="turno-fila-izq">
                <span class="turno-numero">${p.turno}</span>
                ${badgePrio}
            </div>
            <div class="turno-fila-der">
                <span class="turno-consulta">${p.paciente}</span>
                <div class="turno-tiempos">
                    ${transHTML}
                    ${badgeTope}
                    ${alertaHTML}
                </div>
            </div>
        `;
        lista.appendChild(fila);
    });

    // Actualizar tiempos cada 30 segundos
    intervaloEspera = setInterval(actualizarTiemposEspera, 30000);
}

async function cargarEstadisticas() {
    try {
        const respuesta = await fetch(`${API_URL}/api/kpis/resumen`);
        const data = await respuesta.json();

        if (data && data.total_pacientes !== undefined) {
            document.getElementById('pendientes').textContent  = data.total_pendientes || 0;
            document.getElementById('enTriage').textContent   = data.en_triage || 0;
            document.getElementById('enAtencion').textContent = data.en_atencion_medica || 0;
            document.getElementById('atendidos').textContent  = data.total_atendidos || 0;
        }
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}

function mostrarSalaVacia() {
    document.getElementById('turnoActual').textContent  = '---';
    document.getElementById('pacienteActual').textContent = 'Esperando pacientes...';
    document.getElementById('displayTurno').classList.add('sin-turnos');
    const panelPrio = document.getElementById('turnoActualPrioridad');
    if (panelPrio) panelPrio.style.display = 'none';
}

function actualizarConexion(conectado) {
    const dot  = document.getElementById('connDot');
    const text = document.getElementById('connText');
    if (dot && text) {
        dot.classList.toggle('disconnected', !conectado);
        text.textContent = conectado ? 'Conectado' : 'Desconectado';
    }
}

function actualizarReloj() {
    const ahora = new Date();
    const hora  = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const fecha = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    document.getElementById('reloj').innerHTML = `${hora}<br><span style="font-size:11px;opacity:0.7;text-transform:capitalize;">${fecha}</span>`;
}

document.addEventListener('DOMContentLoaded', function () {
    cargarSala();
    cargarEstadisticas();

    socket = io(API_URL);
    socket.on('connect',       () => actualizarConexion(true));
    socket.on('disconnect',    () => actualizarConexion(false));
    socket.on('connect_error', () => actualizarConexion(false));

    const recargar = () => { cargarSala(); cargarEstadisticas(); };
    socket.on('turno:llamado',          recargar);
    socket.on('turno:en_triage',        recargar);
    socket.on('turno:pendiente_medico', recargar);
    socket.on('turno:en_atencion',      recargar);
    socket.on('turno:finalizado',       recargar);
    socket.on('turno:no_asiste',        recargar);
    socket.on('turno:cancelado',        recargar);
    socket.on('turno:reiniciado',       recargar);

    setInterval(actualizarReloj, 1000);
    actualizarReloj();
});
