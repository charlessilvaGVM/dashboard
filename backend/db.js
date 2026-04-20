require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || 'gvmadmin',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || 'gvmgvm',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

const promisePool = pool.promise();

promisePool.getConnection()
  .then(conn => {
    console.log('[DB] MySQL connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('[DB] MySQL connection error:', err.message);
  });

// ── Multi-connection support ──────────────────────────────────────────────────
const extraPools = new Map(); // connectionId (number) → promise pool

async function getPoolForConnection(connectionId) {
  if (!connectionId) return promisePool;

  if (extraPools.has(connectionId)) return extraPools.get(connectionId);

  const [rows] = await promisePool.query(
    'SELECT host, port, `database`, user, password FROM db_connections WHERE id = ? AND ativo = 1',
    [connectionId]
  );
  if (!rows || rows.length === 0) throw new Error(`Conexão ID ${connectionId} não encontrada ou inativa`);

  const c = rows[0];
  const newPool = mysql.createPool({
    host: c.host,
    port: parseInt(c.port) || 3306,
    database: c.database,
    user: c.user,
    password: c.password,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  }).promise();

  extraPools.set(connectionId, newPool);
  return newPool;
}

function invalidateConnectionPool(connectionId) {
  extraPools.delete(connectionId);
}

module.exports = promisePool;
module.exports.getPoolForConnection = getPoolForConnection;
module.exports.invalidateConnectionPool = invalidateConnectionPool;
