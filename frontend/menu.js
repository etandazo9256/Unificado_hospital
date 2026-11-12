/* ============================================================================
   Menú principal — diseño original (botones a la izquierda, conectado arriba)
   - Reloj y fecha
   - Estado en vivo vía /api/turnos/sala
   - Conexión (chip Conectado / Desconectado)
   - Socket.IO con anti-rebote (escucha matriz:actualizada)
   - Tarjeta Importar Matriz (CSV/Excel)
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

// ---------------------------------------------------------------------------
// Reloj y fecha
// ---------------------------------------------------------------------------
function actualizarReloj() {
    const ahora = new Date();
    document.getElementById('reloj').textContent = ahora.toLocaleTimeString('es-EC', { hour12: false });
    const el = document.getElementById('fechaHoy');
    if (el) {
        el.textContent = ahora.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
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
    }
}

// ---------------------------------------------------------------------------
// Estado en vivo (misma API que la Sala de Espera)
// ---------------------------------------------------------------------------
async function actualizarEstado() {
    try {
        const r = await fetch('/api/turnos/sala');
        const d = await r.json();
        const s = d.stats || {};
        document.getElementById('mPendientes').textContent = numero(s.pendientes);
        document.getElementById('mTriage').textContent = numero(s.enTriage);
        document.getElementById('mConsulta').textContent = numero(s.enConsulta);
        document.getElementById('mAtendidos').textContent = numero(s.atendidos);
        document.getElementById('mPromedio').textContent = numero(s.tiempoPromedio);
        marcarConexion(true);
    } catch {
        marcarConexion(false);
    }
}

actualizarEstado();
setInterval(actualizarEstado, 15000);

// ---------------------------------------------------------------------------
// Socket.IO: refresco instantáneo ante eventos de turnos y matriz actualizada
// ---------------------------------------------------------------------------
let temporizadorRefresco = null;
function refrescarPronto() {
    if (temporizadorRefresco) return;
    temporizadorRefresco = setTimeout(() => {
        temporizadorRefresco = null;
        Promise.allSettled([actualizarEstado()]);
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
// Importar Matriz de Turnos (tarjeta integrada)
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
