// Estado del sistema
let turnosData = [];

// Función para obtener turnos pendientes
async function obtenerTurnosPendientes() {
    try {
        const respuesta = await fetch('http://localhost:3000/api/turnos/pendientes');
        const datos = await respuesta.json();
        return datos;
    } catch (error) {
        console.error('Error al obtener turnos pendientes:', error);
        return [];
    }
}

// Función principal para cargar y mostrar turnos
async function cargarTurnos() {
    try {
        // Obtener todos los turnos para estadísticas
        const respuesta = await fetch('http://localhost:3000/api/turnos');
        const todosLosTurnos = await respuesta.json();

        // Obtener solo pendientes
        const pendientes = todosLosTurnos
            .filter(t => !t.atendido)
            .sort((a, b) => new Date(a.fecha_turno) - new Date(b.fecha_turno));

        const atendidos = todosLosTurnos.filter(t => t.atendido);

        // Actualizar estadísticas
        document.getElementById("totalTurnos").textContent = todosLosTurnos.length;
        document.getElementById("pendientes").textContent = pendientes.length;
        document.getElementById("atendidos").textContent = atendidos.length;

        // Calcular espera promedio
        let totalMinutos = 0;
        let contador = 0;
        atendidos.forEach(turno => {
            if (turno.fecha_turno && turno.fecha_triage) {
                const inicio = new Date(turno.fecha_turno);
                const fin = new Date(turno.fecha_triage);
                totalMinutos += (fin - inicio) / 60000;
                contador++;
            }
        });
        const promedio = contador > 0 ? Math.round(totalMinutos / contador) : 0;
        document.getElementById("esperaPromedio").textContent = promedio;

        // Actualizar display de turnos
        actualizarDisplayTurnos(pendientes);

        // Guardar datos para uso posterior
        turnosData = pendientes;

    } catch (error) {
        console.error('Error al cargar turnos:', error);
        mostrarError('Error al cargar los turnos');
    }
}

// Función para actualizar el display de turnos
function actualizarDisplayTurnos(pendientes) {
    const displayTurno = document.querySelector('.display-turno');
    const listaProximos = document.getElementById('listaProximosTurnos');
    
    // Asignar números de consultorio rotativos
    const consultorios = ['01', '02', '03', '04', '05', '06', '07'];
    let consultorioIndex = 0;

    if (pendientes.length > 0) {
        // Turno actual (el primero)
        const turno = pendientes[0];
        const consultorio = consultorios[consultorioIndex % consultorios.length];
        
        document.getElementById("turnoActual").textContent = turno.turno;
        document.getElementById("pacienteActual").textContent = turno.paciente;
        document.getElementById("consultorioActual").textContent = `Consultorio ${consultorio}`;

        // Lista de próximos turnos (máximo 5)
        const proximos = pendientes.slice(1, 6);
        listaProximos.innerHTML = '';

        if (proximos.length > 0) {
            proximos.forEach((prox, index) => {
                const consultorioProx = consultorios[(consultorioIndex + index + 1) % consultorios.length];
                const fila = document.createElement('div');
                fila.className = 'fila-turno';
                fila.innerHTML = `
                    <span class="turno-numero">${prox.turno}</span>
                    <span class="turno-consulta">Citas <span class="consultorio-numero">${consultorioProx}</span></span>
                `;
                listaProximos.appendChild(fila);
            });
        } else {
            listaProximos.innerHTML = '<div class="fila-vacia">No hay más turnos pendientes</div>';
        }

        // Remover clase de "sin turnos" si existe
        displayTurno.classList.remove('sin-turnos');

    } else {
        // No hay turnos pendientes
        document.getElementById("turnoActual").textContent = "---";
        document.getElementById("pacienteActual").textContent = "Sin turnos pendientes";
        document.getElementById("consultorioActual").textContent = "Consultorio --";
        listaProximos.innerHTML = '<div class="fila-vacia">Todos los turnos atendidos 🎉</div>';
        displayTurno.classList.add('sin-turnos');
    }
}

// Función para avanzar al siguiente turno
async function siguienteTurno() {
    try {
        const btnSiguiente = document.getElementById('btnSiguiente');
        const textoOriginal = btnSiguiente.innerHTML;
        btnSiguiente.innerHTML = '⏳ Procesando...';
        btnSiguiente.disabled = true;

        const respuesta = await fetch('http://localhost:3000/api/turnos/siguiente', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await respuesta.json();

        if (data.success) {
            reproducirSonidoLlamada();
            await cargarTurnos();

            if (data.turnoAtendido) {
                mostrarNotificacion(`Turno ${data.turnoAtendido.turno} atendido`, 'success');
            }

            if (data.siguienteTurno) {
                mostrarNotificacion(`Siguiente: ${data.siguienteTurno.turno}`, 'info');
            } else {
                mostrarNotificacion('No hay más turnos pendientes', 'warning');
            }

        } else {
            mostrarNotificacion(data.message || 'Error al avanzar turno', 'error');
        }

    } catch (error) {
        console.error('Error al avanzar turno:', error);
        mostrarNotificacion('Error al procesar el turno', 'error');
    } finally {
        const btnSiguiente = document.getElementById('btnSiguiente');
        btnSiguiente.innerHTML = 'SIGUIENTE TURNO';
        btnSiguiente.disabled = false;
    }
}

// Función para llamar nuevamente
function llamarNuevamente() {
    const turnoActual = document.getElementById("turnoActual").textContent;
    const pacienteActual = document.getElementById("pacienteActual").textContent;
    
    if (turnoActual && turnoActual !== "---" && turnoActual !== "🏥") {
        const displayTurno = document.querySelector('.display-turno');
        displayTurno.classList.add('llamando');
        setTimeout(() => {
            displayTurno.classList.remove('llamando');
        }, 2000);

        reproducirSonidoLlamada();
        mostrarNotificacion(`Llamando: ${turnoActual} - ${pacienteActual}`, 'info');
    } else {
        mostrarNotificacion('No hay turno actual para llamar', 'warning');
    }
}

// Función para reiniciar el sistema
async function reiniciarSistema() {
    if (confirm('⚠️ ¿Estás seguro de reiniciar el sistema?')) {
        try {
            const respuesta = await fetch('http://localhost:3000/api/turnos/reiniciar', {
                method: 'POST'
            });
            const data = await respuesta.json();
            
            if (data.success) {
                mostrarNotificacion('✅ Sistema reiniciado correctamente', 'success');
                await cargarTurnos();
            } else {
                mostrarNotificacion('Error al reiniciar el sistema', 'error');
            }
        } catch (error) {
            console.error('Error al reiniciar:', error);
            mostrarNotificacion('Error al reiniciar el sistema', 'error');
        }
    }
}

// Funciones de utilidad
function mostrarNotificacion(mensaje, tipo = 'info') {
    const notificacion = document.createElement('div');
    notificacion.className = `notificacion notificacion-${tipo}`;
    notificacion.textContent = mensaje;
    document.body.appendChild(notificacion);

    setTimeout(() => {
        notificacion.classList.add('mostrar');
    }, 10);

    setTimeout(() => {
        notificacion.classList.remove('mostrar');
        setTimeout(() => {
            notificacion.remove();
        }, 400);
    }, 4000);
}

function mostrarError(mensaje) {
    document.getElementById("turnoActual").textContent = "⚠️";
    document.getElementById("pacienteActual").textContent = mensaje;
    document.getElementById("consultorioActual").textContent = "Consultorio --";
    document.getElementById("listaProximosTurnos").innerHTML = 
        '<div class="fila-vacia">Error al cargar datos</div>';
}

function reproducirSonidoLlamada() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        [440, 550].forEach((frecuencia, index) => {
            setTimeout(() => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.frequency.value = frecuencia;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
            }, index * 300);
        });
    } catch (error) {
        // Silencio si no hay audio
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

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    cargarTurnos();

    document.getElementById('btnSiguiente').addEventListener('click', siguienteTurno);
    document.getElementById('btnLlamar').addEventListener('click', llamarNuevamente);
    document.getElementById('btnReiniciar').addEventListener('click', reiniciarSistema);

    setInterval(actualizarReloj, 1000);
    actualizarReloj();

    setInterval(cargarTurnos, 30000);

    // Teclas rápidas
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            siguienteTurno();
        }
        if (e.key === 'r' || e.key === 'R') {
            llamarNuevamente();
        }
    });
});