/* ============================================================
   Menú Unificado — lógica (reloj, estado en vivo, pantalla completa)
   ============================================================ */

// ---- Reloj y fecha ----
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

// ---- Pantalla completa ----
// (el botón se movió a la Sala de Espera y a la pantalla Manchester)

// ---- Estado en vivo (la misma API que consumen las otras pantallas) ----
async function actualizarEstado() {
    try {
        const r = await fetch('/api/turnos/sala');
        const d = await r.json();
        const s = d.stats || {};
        document.getElementById('mPendientes').textContent = s.pendientes ?? '--';
        document.getElementById('mTriage').textContent = s.enTriage ?? '--';
        document.getElementById('mConsulta').textContent = s.enConsulta ?? '--';
        document.getElementById('mAtendidos').textContent = s.atendidos ?? '--';
        document.getElementById('mPromedio').textContent = s.tiempoPromedio ?? '--';
        marcarConexion(true);
    } catch {
        document.getElementById('mPendientes').textContent = '--';
        document.getElementById('mTriage').textContent = '--';
        document.getElementById('mConsulta').textContent = '--';
        document.getElementById('mAtendidos').textContent = '--';
        document.getElementById('mPromedio').textContent = '--';
        marcarConexion(false);
    }
}

function marcarConexion(ok) {
    const dot = document.getElementById('connDot');
    const txt = document.getElementById('connText');
    if (!dot) return;
    dot.classList.toggle('off', !ok);
    txt.textContent = ok ? 'Conectado' : 'Desconectado';
}

actualizarEstado();
setInterval(actualizarEstado, 15000);
