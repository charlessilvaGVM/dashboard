const express = require('express');
const router  = express.Router();
const db      = require('../db');
const auth    = require('../middleware/auth');

router.use(auth);

function adminOnly(req, res, next) {
  if (req.user?.nivel !== 'admin')
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  next();
}

router.use(adminOnly);

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS execution_logs (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      dashboard_id     INT DEFAULT NULL,
      dashboard_nome   VARCHAR(255) DEFAULT NULL,
      user_id          INT DEFAULT NULL,
      usuario          VARCHAR(255) DEFAULT NULL,
      execution_time_ms INT DEFAULT 0,
      row_count        INT DEFAULT 0,
      executed_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_executed_at (executed_at),
      INDEX idx_dashboard_id (dashboard_id),
      INDEX idx_user_id (user_id)
    )
  `);
}
ensureTable();

// GET / — list logs with pagination and filters
router.get('/', async (req, res) => {
  try {
    const page        = Math.max(1, parseInt(req.query.page)  || 1);
    const limit       = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset      = (page - 1) * limit;
    const dashboard   = req.query.dashboard || '';
    const usuario     = req.query.usuario   || '';
    const dt_ini      = req.query.dt_ini    || '';
    const dt_fim      = req.query.dt_fim    || '';

    const where = [];
    const vals  = [];

    if (dashboard) { where.push('dashboard_nome LIKE ?'); vals.push(`%${dashboard}%`); }
    if (usuario)   { where.push('usuario LIKE ?');        vals.push(`%${usuario}%`);   }
    if (dt_ini)    { where.push('executed_at >= ?');      vals.push(`${dt_ini} 00:00:00`); }
    if (dt_fim)    { where.push('executed_at <= ?');      vals.push(`${dt_fim} 23:59:59`); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM execution_logs ${whereClause}`,
      vals
    );

    const [rows] = await db.query(
      `SELECT id, dashboard_id, dashboard_nome, user_id, usuario, execution_time_ms, row_count, executed_at
       FROM execution_logs ${whereClause}
       ORDER BY executed_at DESC
       LIMIT ? OFFSET ?`,
      [...vals, limit, offset]
    );

    res.json({ total, page, limit, rows });
  } catch (err) {
    console.error('[logs/GET /]', err);
    res.status(500).json({ error: 'Erro ao listar logs' });
  }
});

// DELETE /clear — clear all logs (admin only)
router.delete('/clear', async (req, res) => {
  try {
    await db.query('TRUNCATE TABLE execution_logs');
    res.json({ message: 'Logs apagados' });
  } catch (err) {
    console.error('[logs/DELETE /clear]', err);
    res.status(500).json({ error: 'Erro ao limpar logs' });
  }
});

module.exports = router;
module.exports.ensureTable = ensureTable;
