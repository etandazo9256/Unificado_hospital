const { Pool } = require('pg');
require('dotenv').config();

const isLocal = ['localhost', '127.0.0.1'].includes(process.env.DB_HOST);
const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: isLocal ? undefined : { rejectUnauthorized: false }
});

module.exports = pool;
