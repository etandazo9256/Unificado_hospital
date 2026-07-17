const API_URL = '';
let turnoAnterior = null;
let socket = null;

async function cargarSala() {
    try {
        const respuesta = await fetch(`${API_URL}/api/turnos/sala`);
        const data = await respuesta.json();

        if (!data.success) {
            mostrarSalaVacia();
            return;
        }

        const turnoActual = data.turnoActual;
        const proximos = data.proximos || [];
        const enTriageCount = data.enTriageCount || 0;

        if (turnoActual) {
            if (turnoActual.turno !== turnoAnterior) {
                turnoAnterior = turnoActual.turno;
                reproducirSonidoLlamada();
                reproducirVozLlamada(turnoActual.turno, turnoActual.paciente);
            }
            document.getElementById("turnoActual").textContent = turnoActual.turno;
            document.getElementById("pacienteActual").textContent = turnoActual.paciente || '---';
            document.getElementById('displayTurno').classList.remove('sin-turnos');
        } else {
            mostrarSalaVacia();
        }

        const lista = document.getElementById('listaProximosTurnos');
        lista.innerHTML = '';

        if (proximos.length > 0) {
            proximos.forEach(p => {
                const fila = document.createElement('div');
                fila.className = 'fila-turno';
                fila.innerHTML = `
                    <span class="turno-numero">${p.turno}</span>
                    <span class="turno-consulta">${p.paciente}</span>
                `;
                lista.appendChild(fila);
            });
        } else {
            lista.innerHTML = '<div class="fila-vacia">No hay turnos pendientes</div>';
        }

        document.getElementById('enTriageCount').textContent = enTriageCount;
        document.getElementById('pendientesCount').textContent = proximos.length;

    } catch (error) {
        console.error('Error al cargar sala:', error);
        mostrarSalaVacia();
    }
}

async function cargarEstadisticas() {
    try {
        const respuesta = await fetch(`${API_URL}/api/kpis/resumen`);
        const data = await respuesta.json();

        if (data && data.total_pacientes !== undefined) {
            document.getElementById('pendientes').textContent = data.total_pendientes || 0;
            document.getElementById('enTriage').textContent = data.en_triage || 0;
            document.getElementById('enAtencion').textContent = data.en_atencion_medica || 0;
            document.getElementById('atendidos').textContent = data.total_atendidos || 0;
        }
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}

function mostrarSalaVacia() {
    document.getElementById("turnoActual").textContent = "---";
    document.getElementById("pacienteActual").textContent = "Esperando pacientes...";
    document.getElementById('displayTurno').classList.add('sin-turnos');
}

function actualizarConexion(conectado) {
    const dot = document.getElementById('connDot');
    const text = document.getElementById('connText');
    if (dot && text) {
        dot.classList.toggle('disconnected', !conectado);
        text.textContent = conectado ? 'Conectado' : 'Desconectado';
    }
}

function actualizarReloj() {
    const ahora = new Date();
    document.getElementById("reloj").innerText =
        ahora.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
}

document.addEventListener('DOMContentLoaded', function () {
    cargarSala();
    cargarEstadisticas();

    socket = io(API_URL);
    socket.on('connect', () => actualizarConexion(true));
    socket.on('disconnect', () => actualizarConexion(false));
    socket.on('connect_error', () => actualizarConexion(false));
    socket.on('turno:llamado', () => { cargarSala(); cargarEstadisticas(); });
    socket.on('turno:en_triage', () => { cargarSala(); cargarEstadisticas(); });
    socket.on('turno:pendiente_medico', () => { cargarSala(); cargarEstadisticas(); });
    socket.on('turno:en_atencion', () => { cargarSala(); cargarEstadisticas(); });
    socket.on('turno:finalizado', () => { cargarSala(); cargarEstadisticas(); });
    socket.on('turno:no_asiste', () => { cargarSala(); cargarEstadisticas(); });
    socket.on('turno:cancelado', () => { cargarSala(); cargarEstadisticas(); });
    socket.on('turno:reiniciado', () => { cargarSala(); cargarEstadisticas(); });

    setInterval(actualizarReloj, 1000);
    actualizarReloj();
});
