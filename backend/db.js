const { Pool } = require('pg');
require('dotenv').config();

const isLocal = ['localhost', '127.0.0.1'].includes(process.env.DB_HOST);
const pool = new Pool({
    host: process.env.DB_HOST,
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

module.exports = pool;
