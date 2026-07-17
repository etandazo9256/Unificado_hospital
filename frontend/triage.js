const API_URL = '';
let currentTurnoId = null;
let personalList = [];
let llamadosList = [];
let socket = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnLlamarSiguiente').addEventListener('click', llamarSiguiente);
    document.getElementById('btnRellamar').addEventListener('click', rellamar);
    document.getElementById('btnNoAsiste').addEventListener('click', marcarNoAsiste);

    cargarPersonal().then(() => cargarTriage());

    socket = io(API_URL);
    socket.on('connect', () => actualizarConexion(true));
    socket.on('disconnect', () => actualizarConexion(false));
    socket.on('connect_error', () => actualizarConexion(false));
    socket.on('turno:llamado', cargarTriage);
    socket.on('turno:en_triage', cargarTriage);
    socket.on('turno:pendiente_medico', cargarTriage);
    socket.on('turno:en_atencion', cargarTriage);
    socket.on('turno:finalizado', cargarTriage);
    socket.on('turno:no_asiste', cargarTriage);
    socket.on('turno:cancelado', cargarTriage);
    socket.on('turno:reiniciado', cargarTriage);

    setInterval(actualizarReloj, 1000);
    actualizarReloj();
});

async function cargarTriage() {
    const results = await Promise.allSettled([
        fetch(`${API_URL}/api/turnos/sala`).then(r => r.json()),
        fetch(`${API_URL}/api/turnos/pendientes-triage`).then(r => r.json()),
        fetch(`${API_URL}/api/kpis/resumen`).then(r => r.json())
    ]);

    const salaRes = results[0].status === 'fulfilled' ? results[0].value : null;
    const pendientesRes = results[1].status === 'fulfilled' ? results[1].value : null;
    const enTriageRes = results[2].status === 'fulfilled' ? results[2].value : null;

    if (salaRes && salaRes.success && salaRes.turnoActual) {
        const t = salaRes.turnoActual;
        document.getElementById('turnoActual').textContent = t.turno;
        document.getElementById('pacienteActual').textContent = t.paciente || '---';
        currentTurnoId = t.id;
    } else {
        document.getElementById('turnoActual').textContent = '---';
        document.getElementById('pacienteActual').textContent = '---';
        currentTurnoId = null;
    }

    const data = pendientesRes ? (pendientesRes.data || []) : [];
    const llamados = data.filter(p => p.estado === 'llamado');
    const pendientesList = data.filter(p => p.estado === 'pendiente');
    const enTriage = data.filter(p => p.estado === 'en_triage');

    renderLlamados(llamados);
    renderEnTriage(enTriage, enTriageRes);
    renderPendientes(pendientesList);

    document.getElementById('badgeLlamados').textContent = llamados.length;
    document.getElementById('badgeEnTriage').textContent = enTriage.length;
    document.getElementById('badgePendientes').textContent = pendientesList.length;
}

function renderLlamados(llamados) {
    llamadosList = llamados;
    const container = document.getElementById('listaParaTriage');
    container.innerHTML = '';

    if (llamados.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay pacientes llamados</div>';
        return;
    }

    llamados.forEach(p => {
        const card = document.createElement('div');
        card.className = 'patient-card';
        card.innerHTML = `
            <div class="patient-info">
                <strong class="patient-turno">${p.turno}</strong>
                <span class="patient-name">${p.paciente}</span>
            </div>
            <div class="patient-actions" style="flex-wrap:wrap;">
                <select class="form-select" id="resp-inicio-${p.id}" style="flex:1;min-width:130px;">
                    <option value="">Responsable triage</option>
                    ${personalList.filter(r => r.tipo === 'signos_vitales' || r.tipo === 'triage').map(r => `<option value="${r.nombre}">${r.nombre}</option>`).join('')}
                </select>
                <button class="btn-small btn-primary" onclick="iniciarTriage(${p.id})">
                    Iniciar Triage
                </button>
                <button class="btn-small btn-danger" onclick="cancelarTurno(${p.id})">
                    Cancelar
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderEnTriage(enTriage) {
    const container = document.getElementById('listaEnTriage');
    container.innerHTML = '';

    if (enTriage.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay pacientes en triage</div>';
        return;
    }

    enTriage.forEach(p => {
        const card = document.createElement('div');
        card.className = 'patient-card active';
        card.innerHTML = `
            <div class="patient-info">
                <strong class="patient-turno">${p.turno}</strong>
                <span class="patient-name">${p.paciente}</span>
            </div>
            <div class="patient-form">
                <select class="form-select priority-select" id="prioridad-${p.id}" onchange="previewPrioridad(${p.id})">
                    <option value="">Seleccionar Prioridad</option>
                    <option value="ROJO" style="background:#EF4444;color:white;">Rojo (Crítico)</option>
                    <option value="AMARILLO" style="background:#F59E0B;color:white;">Amarillo (Urgente)</option>
                    <option value="VERDE" style="background:#10B981;color:white;">Verde (No Urgente)</option>
                    <option value="SIN CLASIFICAR" style="background:#64748B;color:white;">Sin Clasificar</option>
                </select>
                <span class="priority-badge preview-badge" id="preview-${p.id}" style="display:none;"></span>
                <select class="form-select" id="consultorio-${p.id}" style="min-width:120px;">
                    <option value="">Consultorio</option>
                    <option value="Consultorio 1">Consultorio 1</option>
                    <option value="Consultorio 2">Consultorio 2</option>
                    <option value="Consultorio 3">Consultorio 3</option>
                    <option value="Consultorio 4">Consultorio 4</option>
                    <option value="Consultorio 5">Consultorio 5</option>
                </select>
                <select class="form-select" id="responsable-${p.id}" style="flex:1;min-width:130px;">
                    <option value="">Médico responsable</option>
                    ${personalList.filter(r => r.tipo === 'triage' || r.tipo === 'medico').map(r => `<option value="${r.nombre}">${r.nombre}</option>`).join('')}
                </select>
                <button class="btn-small btn-success" onclick="finalizarTriage(${p.id})">
                    Finalizar
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderPendientes(pendientes) {
    const tbody = document.getElementById('bodyPendientes');
    tbody.innerHTML = '';

    if (pendientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-cell">No hay turnos pendientes</td></tr>';
        return;
    }

    pendientes.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.turno}</strong></td>
            <td>${p.paciente}</td>
            <td>${p.fecha_turno ? new Date(p.fecha_turno).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '---'}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function llamarSiguiente() {
    const btn = document.getElementById('btnLlamarSiguiente');
    btn.disabled = true;
    btn.innerHTML = 'Llamando...';

    try {
        const res = await fetch(`${API_URL}/api/turnos/llamar-siguiente`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            mostrarNotificacion(`Turno ${data.turno.turno} llamado`, 'success');
            reproducirSonidoLlamada();
            reproducirVozLlamada(data.turno.turno, data.turno.paciente);
        } else {
            mostrarNotificacion(data.message || 'No hay turnos pendientes', 'warning');
        }
    } catch (error) {
        mostrarNotificacion('Error al llamar turno', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Llamar Siguiente';
    }
}

async function rellamar() {
    const id = currentTurnoId;
    if (!id) {
        mostrarNotificacion('No hay turno actual para rellamar', 'warning');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/turnos/${id}/rellamar`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            mostrarNotificacion(`Re-llamando turno ${data.turno.turno}`, 'info');
            reproducirSonidoLlamada();
            reproducirVozLlamada(data.turno.turno, data.turno.paciente);
        } else {
            mostrarNotificacion(data.message, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al rellamar', 'error');
    }
}

async function iniciarTriage(id) {
    const resp = document.getElementById(`resp-inicio-${id}`).value;
    try {
        const res = await fetch(`${API_URL}/api/turnos/${id}/iniciar-triage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resp_triage: resp || undefined })
        });
        const data = await res.json();

        if (data.success) {
            mostrarNotificacion(`Triage iniciado para ${data.turno.turno}`, 'success');
        } else {
            mostrarNotificacion(data.message, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al iniciar triage', 'error');
    }
}

async function finalizarTriage(id) {
    const prioridad = document.getElementById(`prioridad-${id}`).value;
    const consultorio = document.getElementById(`consultorio-${id}`).value;
    const responsable = document.getElementById(`responsable-${id}`).value;

    if (!prioridad) {
        mostrarNotificacion('Debe seleccionar una prioridad', 'warning');
        return;
    }

    try {
        const res = await fetch(`${API_URL}/api/turnos/${id}/finalizar-triage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prioridad,
                consultorio: consultorio || undefined,
                resp_sig_vitales: responsable || undefined
            })
        });
        const data = await res.json();

        if (data.success) {
            mostrarNotificacion(`Triage finalizado para ${data.turno.turno}`, 'success');
        } else {
            mostrarNotificacion(data.message, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al finalizar triage', 'error');
    }
}

async function marcarNoAsiste() {
    if (llamadosList.length === 0) {
        mostrarNotificacion('No hay pacientes llamados', 'warning');
        return;
    }
    const id = llamadosList[0].id;

    try {
        const res = await fetch(`${API_URL}/api/turnos/${id}/no-asiste`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            mostrarNotificacion(`Turno ${data.turno.turno} marcado como no asistió`, 'info');
            llamarSiguiente();
        } else {
            mostrarNotificacion(data.message, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al marcar no asiste', 'error');
    }
}

async function cancelarTurno(id) {
    if (!confirm('¿Cancelar este turno?')) return;

    try {
        const res = await fetch(`${API_URL}/api/turnos/${id}/cancelar`, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            mostrarNotificacion(`Turno ${data.turno.turno} cancelado`, 'info');
        } else {
            mostrarNotificacion(data.message, 'error');
        }
    } catch (error) {
        mostrarNotificacion('Error al cancelar turno', 'error');
    }
}

function previewPrioridad(id) {
    const sel = document.getElementById(`prioridad-${id}`);
    const preview = document.getElementById(`preview-${id}`);
    const val = sel.value;
    if (val) {
        const colores = { 'ROJO': '#EF4444', 'AMARILLO': '#F59E0B', 'VERDE': '#10B981', 'SIN CLASIFICAR': '#64748B' };
        preview.style.display = 'inline-block';
        preview.style.background = colores[val] || '#64748B';
        preview.textContent = val;
    } else {
        preview.style.display = 'none';
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
