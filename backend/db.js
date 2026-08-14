const { Pool } = require('pg');
require('dotenv').config();

const isLocal = ['localhost', '127.0.0.1'].includes(process.env.DB_HOST);
const pool = new Pool({
    host: process.env.DB_HOST, // Ejemplo: YOUR-PROJECT.supabase.co
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false }
});

pool.on('error', err => {
    console.error('Error inesperado en el pool de conexiones:', err.message);
});

// Reintentos automáticos ante fallos de red (ETIMEDOUT, ECONNREFUSED, etc.)
const REINTENTOS_MAX = 3;
const ESPERA_BASE_MS = 500;

function esErrorRed(err) {
    if (!err) return false;
    const code = err.code || '';
    const msg = err.message || '';
    return (
        code === 'ETIMEDOUT' ||
        code === 'ECONNREFUSED' ||
        code === 'ECONNRESET' ||
        code === 'ENOTFOUND' ||
        code === 'EAI_AGAIN' ||
        code === 'EHOSTUNREACH' ||
        code === 'ENETUNREACH' ||
        /connect ETIMEDOUT|connect ECONNREFUSED|socket hang up|Connection terminated/i.test(msg)
    );
}

const queryOriginal = pool.query.bind(pool);
pool.query = async function (text, params) {
    let ultimoError;
    for (let intento = 1; intento <= REINTENTOS_MAX; intento++) {
        try {
            return params !== undefined
                ? await queryOriginal(text, params)
                : await queryOriginal(text);
        } catch (err) {
            ultimoError = err;
            if (!esErrorRed(err)) throw err;
            if (intento < REINTENTOS_MAX) {
                console.error(`[db] Fallo de red (intento ${intento}/${REINTENTOS_MAX}), reintentando en ${ESPERA_BASE_MS * intento}ms: ${codeResumen(err)}`);
                await new Promise(r => setTimeout(r, ESPERA_BASE_MS * intento));
            }
        }
    }
    throw ultimoError;
};

function codeResumen(err) {
    return `${err.code || ''} ${(err.message || '').split('\n')[0]}`.trim();
}

module.exports = pool;