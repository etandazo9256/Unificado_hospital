const API_URL = 'http://localhost:3000';
let personalList = [];
let socket = null;

document.addEventListener('DOMContentLoaded', () => {
    cargarPersonal().then(() => cargarMedico());

    socket = io(API_URL);
    socket.on('connect', () => actualizarConexion(true));
    socket.on('disconnect', () => actualizarConexion(false));
    socket.on('connect_error', () => actualizarConexion(false));
    socket.on('turno:pendiente_medico', cargarMedico);
    socket.on('turno:en_atencion', cargarMedico);
    socket.on('turno:finalizado', cargarMedico);
    socket.on('turno:cancelado', cargarMedico);
    socket.on('turno:no_asiste', cargarMedico);
    socket.on('turno:reiniciado', cargarMedico);
    socket.on('turno:llamado', cargarMedico);

    setInterval(actualizarReloj, 1000);
    actualizarReloj();
});

async function cargarMedico() {
    const results = await Promise.allSettled([
        fetch(`${API_URL}/api/turnos/pendientes-medico`).then(r => r.json()),
        fetch(`${API_URL}/api/turnos/en-atencion-medica`).then(r => r.json())
    ]);

    const pendientesRes = results[0].status === 'fulfilled' ? results[0].value : null;
    const atencionRes = results[1].status === 'fulfilled' ? results[1].value : null;

    const pendientes = pendientesRes ? (pendientesRes.data || []) : [];
    const enAtencion = atencionRes ? (atencionRes.data || []) : [];

    renderEnAtencion(enAtencion);
    renderPendientesMedico(pendientes);

    document.getElementById('badgeEnAtencion').textContent = enAtencion.length;
    document.getElementById('badgePendientesMedico').textContent = pendientes.length;
}

function renderEnAtencion(pacientes) {
    const container = document.getElementById('listaEnAtencion');
    container.innerHTML = '';

    if (pacientes.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay pacientes en atención médica</div>';
        return;
    }

    pacientes.forEach(p => {
        const prioridadColor = {
            'ROJO': '#EF4444',
            'AMARILLO': '#F59E0B',
            'VERDE': '#10B981',
            'SIN CLASIFICAR': '#64748B'
        }[p.prioridad] || '#64748B';

        const card = document.createElement('div');
        card.className = 'attention-card';
        card.innerHTML = `
            <div class="attention-card-header">
                <span class="priority-badge" style="background:${prioridadColor}">${p.prioridad || 'S/C'}</span>
                <span class="card-turno">${p.turno}</span>
            </div>
            <div class="attention-card-body">
                <div class="card-patient-name" style="font-size:14px;">${p.paciente}</div>
                <div class="card-detail">Médico: <strong>${p.medico_responsable || '---'}</strong></div>
                <div class="card-detail">Triage por: <strong>${p.resp_triage || '---'}</strong></div>
                <div class="card-detail">Espera: ${p.fecha_inicio_atencion_medica ? calcularTiempoEspera(p.fecha_inicio_atencion_medica) : '---'}</div>
            </div>
            <div class="attention-card-footer">
                <button class="btn-small btn-success" onclick="finalizarAtencion(${p.id})">
                    Finalizar Atención
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderPendientesMedico(pendientes) {
    const tbody = document.getElementById('bodyPendientesMedico');
    tbody.innerHTML = '';

    if (pendientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No hay pacientes pendientes de atención médica</td></tr>';
        return;
    }

    pendientes.forEach(p => {
        const prioridadColor = {
            'ROJO': '#EF4444',
            'AMARILLO': '#F59E0B',
            'VERDE': '#10B981',
            'SIN CLASIFICAR': '#64748B'
        }[p.prioridad] || '#64748B';

        const espera = p.fecha_fin_triage ? calcularTiempoEspera(p.fecha_fin_triage) : '---';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.turno}</strong></td>
            <td>${p.paciente}</td>
            <td><span class="priority-badge" style="background:${prioridadColor}">${p.prioridad || 'S/C'}</span></td>
            <td>${p.resp_triage || '---'}</td>
            <td>${p.consultorio || '---'}</td>
            <td>${espera}</td>
            <td>
                <select class="form-select" id="medico-asignar-${p.id}" style="margin-bottom:4px;width:100%;">
                    <option value="">Médico...</option>
                    ${personalList.filter(r => r.tipo === 'medico' || r.tipo === 'triage').map(r => `<option value="${r.nombre}">${r.nombre}</option>`).join('')}
                </select>
                <button class="btn-small btn-primary" onclick="iniciarAtencion(${p.id})" style="width:100%;">
                    Atender
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function calcularTiempoEspera(fecha) {
    const inicio = new Date(fecha);
    const ahora = new Date();
    const diffMin = Math.floor((ahora - inicio) / 60000);
    if (diffMin < 1) return '< 1 min';
    if (diffMin < 60) return `${diffMin} min`;
    const horas = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return `${horas}h ${mins}min`;
}

async function iniciarAtencion(id) {
    const sel = document.getElementById(`medico-asignar-${id}`);
    const medico = sel ? sel.value : '';
    if (!medico) {
        mostrarNotificacion('Seleccione el médico responsable', 'warning');
        sel?.focus();
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/turnos/${id}/iniciar-atencion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ medico_responsable: medico })
        });
        const data = await res.json();

        if (data.success) {
            mostrarNotificacion(`Paciente ${data.turno.turno} en atención con ${medico}`, 'success');
        } else {
            mostrarNotificacion(data.message, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al procesar atención', 'error');
    }
}

async function finalizarAtencion(id) {
    if (!confirm('¿Finalizar la atención médica de este paciente?')) return;

    try {
        const res = await fetch(`${API_URL}/api/turnos/${id}/finalizar-atencion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.success) {
            mostrarNotificacion(`Atención finalizada para ${data.turno.turno}`, 'success');
        } else {
            mostrarNotificacion(data.message, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al finalizar atención', 'error');
    }
}

function mostrarNotificacion(mensaje, tipo) {
    const div = document.createElement('div');
    div.className = `notificacion notificacion-${tipo}`;
    div.textContent = mensaje;
    document.body.appendChild(div);
    setTimeout(() => div.classList.add('mostrar'), 10);
    setTimeout(() => {
        div.classList.remove('mostrar');
        setTimeout(() => div.remove(), 400);
    }, 4000);
}

async function cargarPersonal() {
    try {
        const res = await fetch(`${API_URL}/api/personal`);
        const data = await res.json();
        if (data.success) personalList = data.data;
    } catch (e) { /* silencio */ }
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
        ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
