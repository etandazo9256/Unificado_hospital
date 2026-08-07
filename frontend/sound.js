let _ctx = null;
function getAudioCtx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
}

function tocarNota(freq, startTime, duration, gain = 0.25, type = 'sine') {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = type;
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(gain, startTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration);
}

function reproducirSonidoLlamada() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        // Ascending chime: C5 → E5 → G5 (major triad)
        tocarNota(523.25, now, 0.25, 0.2, 'sine');
        tocarNota(659.25, now + 0.15, 0.3, 0.2, 'sine');
        tocarNota(783.99, now + 0.3, 0.45, 0.2, 'sine');
        // Soft sine at the end for warmth
        tocarNota(1046.50, now + 0.45, 0.5, 0.08, 'sine');
    } catch (e) { /* silencio */ }
}

function reproducirVozLlamada(turno, paciente) {
    try {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const texto = `Turno ${turno}`;
        const utterance = new SpeechSynthesisUtterance(texto);
        utterance.lang = 'es-ES';
        utterance.rate = 0.85;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        // Esperar a que termine el chime antes de hablar
        setTimeout(() => speechSynthesis.speak(utterance), 600);
    } catch (e) { /* silencio */ }
}

function reproducirSonidoNotificacion() {
    try {
        const ctx = getAudioCtx();
        const now = ctx.currentTime;
        // Soft double beep
        tocarNota(880, now, 0.12, 0.12, 'sine');
        tocarNota(880, now + 0.2, 0.12, 0.12, 'sine');
    } catch (e) { /* silencio */ }
}
