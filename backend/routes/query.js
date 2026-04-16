const express    = require('express');
const router     = express.Router();
const rateLimit  = require('express-rate-limit');
const db         = require('../db');
const auth       = require('../middleware/auth');

router.use(auth);

// A6 — Rate limiting para queries (30 execuções/min por IP)
const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 1 minuto.' },
});

// M9 — LOG_SQL desativado por padrão
const LOG_SQL = process.env.LOG_SQL === 'true';

function logSql(label, sql, values) {
  if (!LOG_SQL) return;
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`\n[SQL LOG ${ts}] ${label}\n${'─'.repeat(60)}\n${sql}\n${'─'.repeat(60)}`);
}

// C2 — Normalização de data para YYYY-MM-DD
function normalizeDate(v) {
  const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  const ymd = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2,'0')}-${ymd[3].padStart(2,'0')}`;
  return v;
}

function isDateLike(v) {
  return /^\d{1,4}[\-\/]\d{1,2}[\-\/]\d{1,4}$/.test(v.trim());
}

// C2 — Converte @param_name → ? e monta array de valores (prepared statement)
function buildParameterizedQuery(sql, params = {}) {
  const paramNames = [];
  const parameterized = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    paramNames.push(name);
    return '?';
  });
  const values = paramNames.map(name => {
    const raw = params[name];
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const v = String(raw).trim();
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (isDateLike(v)) return normalizeDate(v);
    return v;
  });
  return { sql: parameterized, values };
}

// POST /test — valida sintaxe do SQL sem executar (substitui @params por NULL)
router.post('/test', async (req, res) => {
  const { sql } = req.body;
  if (!sql || typeof sql !== 'string') return res.status(400).json({ error: 'SQL is required' });

  const trimmed = sql.trim();
  if (!/^SELECT\s+/i.test(trimmed))
    return res.status(400).json({ error: 'Apenas consultas SELECT são permitidas' });

  const sqlForTest = trimmed.replace(/@[a-zA-Z_][a-zA-Z0-9_]*/g, 'NULL');

  try {
    const connection = await db.getConnection();
    try {
      await connection.query(`EXPLAIN ${sqlForTest}`);
    } finally {
      connection.release();
    }
    res.json({ valid: true });
  } catch (err) {
    res.status(400).json({ valid: false, error: err.sqlMessage || err.message });
  }
});

// POST /execute
router.post('/execute', queryLimiter, async (req, res) => {
  const { sql, params, dashboard_id } = req.body;

  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'SQL query is required' });
  }

  const trimmedSql = sql.trim();

  if (!/^SELECT\s+/i.test(trimmedSql)) {
    return res.status(400).json({ error: 'Only SELECT statements are allowed' });
  }

  const dangerousKeywords = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|REPLACE|GRANT|REVOKE|EXEC|EXECUTE|CALL|LOAD|INTO OUTFILE|INTO DUMPFILE)\b/i;
  if (dangerousKeywords.test(trimmedSql)) {
    return res.status(400).json({ error: 'Query contains disallowed SQL statements' });
  }

  // C2 — Converter @params → prepared statement
  const { sql: finalSql, values } = buildParameterizedQuery(
    trimmedSql,
    params && typeof params === 'object' ? params : {}
  );

  logSql(dashboard_id ? `dash #${dashboard_id}` : 'drill-down', finalSql, values);

  const startTime = Date.now();

  try {
    const connection = await db.getConnection();

    try {
      await connection.query('SET SESSION MAX_EXECUTION_TIME = 30000');
    } catch (e) {
      // Some MySQL versions don't support this
    }

    let rows, fields;
    try {
      [rows, fields] = await connection.query({ sql: finalSql, timeout: 30000 }, values);
    } finally {
      connection.release();
    }

    const executionTime = Date.now() - startTime;

    const columns = fields
      ? fields.map(f => ({ name: f.name, type: f.type || 'unknown' }))
      : rows && rows.length > 0
        ? Object.keys(rows[0]).map(k => ({ name: k, type: 'unknown' }))
        : [];

    res.json({
      columns,
      rows,
      rowCount: rows.length,
      returnedRows: rows.length,
      truncated: false,
      executionTime,
    });
  } catch (err) {
    console.error('[query/execute]', err);
    res.status(400).json({
      error: err.sqlMessage || 'Erro ao executar a query',
      code: err.code,
    });
  }
});

module.exports = router;
