const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const auth     = require('../middleware/auth');
const { auditLog } = require('../audit');

// ── helpers ──────────────────────────────────────────────────────────────────
function parseRow(row) {
  if (!row) return row;
  if (row.params !== undefined && row.params !== null) {
    if (typeof row.params === 'string') {
      try { row.params = JSON.parse(row.params); } catch { row.params = null; }
    }
  }
  if (row.links !== undefined && row.links !== null) {
    if (typeof row.links === 'string') {
      try { row.links = JSON.parse(row.links); } catch { row.links = null; }
    }
  }
  if (row.actions !== undefined && row.actions !== null) {
    if (typeof row.actions === 'string') {
      try { row.actions = JSON.parse(row.actions); } catch { row.actions = null; }
    }
  }
  if (row.chart_config !== undefined && row.chart_config !== null) {
    if (typeof row.chart_config === 'string') {
      try { row.chart_config = JSON.parse(row.chart_config); } catch { row.chart_config = null; }
    }
  }
  if (row.column_hints !== undefined && row.column_hints !== null) {
    if (typeof row.column_hints === 'string') {
      try { row.column_hints = JSON.parse(row.column_hints); } catch { row.column_hints = null; }
    }
  }
  return row;
}

function serializeParams(params) {
  if (!params || !Array.isArray(params) || params.length === 0) return null;
  return JSON.stringify(params);
}

function serializeLinks(links) {
  if (!links || !Array.isArray(links) || links.length === 0) return null;
  return JSON.stringify(links);
}

function serializeActions(actions) {
  if (!actions || !Array.isArray(actions) || actions.length === 0) return null;
  return JSON.stringify(actions);
}

// A1 — Admin-only guard
function adminOnly(req, res, next) {
  if (req.user?.nivel !== 'admin')
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  next();
}

// M5 — Validar ID numérico
function validateId(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: 'ID inválido' });
  next();
}

// N2 — Limite de tamanho de SQL (50 KB)
const MAX_SQL_LENGTH = 50_000;

// N5 — Regex para nomes de coluna/parâmetro válidos (aceita alias tabela.coluna)
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

// N1/N5 — Valida e sanitiza o array de links de drill-down
function validateLinks(links) {
  if (!links) return null;
  if (!Array.isArray(links)) return null;
  const dangerous = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|REPLACE|GRANT|REVOKE|EXEC|EXECUTE|CALL|LOAD|INTO OUTFILE|INTO DUMPFILE)\b/i;
  for (const l of links) {
    if (!l || typeof l !== 'object') throw new Error('Link inválido');
    if (!IDENT_RE.test(String(l.clickColumn  || ''))) throw new Error(`clickColumn inválido: "${l.clickColumn}"`);
    if (!IDENT_RE.test(String(l.valueColumn  || ''))) throw new Error(`valueColumn inválido: "${l.valueColumn}"`);
    if (!IDENT_RE.test(String(l.paramName    || ''))) throw new Error(`paramName inválido: "${l.paramName}"`);
    if (l.sql) {
      const sql = String(l.sql).trim();
      if (sql.length > MAX_SQL_LENGTH) throw new Error('SQL do link muito longo (máx 50 KB)');
      // N1 — Link SQL deve ser SELECT
      if (!/^SELECT\s+/i.test(sql)) throw new Error('SQL do link deve ser uma consulta SELECT');
      if (dangerous.test(sql)) throw new Error('SQL do link contém instrução não permitida');
    }
  }
  return links;
}

// N5 — Valida o array de actions (botões de navegação)
function validateActions(actions) {
  if (!actions) return null;
  if (!Array.isArray(actions)) return null;
  for (const a of actions) {
    if (!a || typeof a !== 'object') throw new Error('Action inválida');
    if (!IDENT_RE.test(String(a.sourceColumn || ''))) throw new Error(`sourceColumn inválido: "${a.sourceColumn}"`);
    if (!IDENT_RE.test(String(a.targetParam  || ''))) throw new Error(`targetParam inválido: "${a.targetParam}"`);
    const targetId = Number(a.targetDashboardId);
    if (!Number.isInteger(targetId) || targetId <= 0) throw new Error('targetDashboardId inválido');
  }
  return actions;
}

// N7 — Valida tipo e tamanho de descricao
function validateDescricao(d) {
  if (d === undefined || d === null) return null;
  if (typeof d !== 'string') throw new Error('Descrição deve ser uma string');
  if (d.length > 2000) throw new Error('Descrição muito longa (máx 2000 caracteres)');
  return d || null;
}

// ── table migration ───────────────────────────────────────────────────────────
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS dashboards (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      nome       VARCHAR(255) NOT NULL,
      descricao  TEXT,
      sql_query  TEXT NOT NULL,
      params     JSON DEFAULT NULL,
      chart_type VARCHAR(20) DEFAULT 'bar',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  const migrations = [
    [`ALTER TABLE dashboards ADD COLUMN params JSON DEFAULT NULL`, 'params column added'],
    [`ALTER TABLE dashboards ADD COLUMN chart_type VARCHAR(20) DEFAULT 'bar'`, 'chart_type column added'],
    [`ALTER TABLE dashboards ADD COLUMN links JSON DEFAULT NULL`, 'links column added'],
    [`ALTER TABLE dashboards ADD COLUMN actions JSON DEFAULT NULL`, 'actions column added'],
    [`ALTER TABLE dashboards ADD COLUMN chart_config JSON DEFAULT NULL`, 'chart_config column added'],
    [`ALTER TABLE dashboards ADD COLUMN chart_sql_query TEXT DEFAULT NULL`, 'chart_sql_query column added'],
    [`ALTER TABLE dashboards ADD COLUMN column_hints JSON DEFAULT NULL`, 'column_hints column added'],
    [`ALTER TABLE dashboards ADD COLUMN refresh_interval INT DEFAULT 0`, 'refresh_interval column added'],
    [`ALTER TABLE dashboards ADD COLUMN connection_id INT DEFAULT NULL`, 'connection_id column added'],
  ];
  for (const [sql, msg] of migrations) {
    try {
      await db.query(sql);
      console.log(`[dashboards] ${msg}`);
    } catch (e) {
      if (!e.message.toLowerCase().includes('duplicate')) console.error('[dashboards] migration warning:', e.message);
    }
  }
}
ensureTable();

// ── routes (all protected) ────────────────────────────────────────────────────
router.use(auth);

// GET /
router.get('/', async (req, res) => {
  try {
    let rows;
    if (req.user?.nivel === 'admin') {
      [rows] = await db.query(
        'SELECT id, nome, descricao, sql_query, chart_sql_query, params, chart_type, links, actions, chart_config, column_hints, refresh_interval, connection_id, created_at, updated_at FROM dashboards ORDER BY updated_at DESC'
      );
    } else {
      [rows] = await db.query(
        `SELECT d.id, d.nome, d.descricao, d.sql_query, d.chart_sql_query, d.params, d.chart_type, d.links, d.actions, d.chart_config, d.column_hints, d.refresh_interval, d.connection_id, d.created_at, d.updated_at
         FROM dashboards d
         INNER JOIN dashboard_permissions dp ON dp.dashboard_id = d.id AND dp.user_id = ?
         ORDER BY d.updated_at DESC`,
        [req.user?.id]
      );
    }
    res.json(rows.map(parseRow));
  } catch (err) {
    console.error('[dashboards/GET /]', err);
    res.status(500).json({ error: 'Erro interno ao listar dashboards' });
  }
});

// GET /:id
router.get('/:id', validateId, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nome, descricao, sql_query, chart_sql_query, params, chart_type, links, actions, chart_config, column_hints, refresh_interval, connection_id, created_at, updated_at FROM dashboards WHERE id = ?',
      [req.params.id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Dashboard not found' });

    // Non-admin: verify permission
    if (req.user?.nivel !== 'admin') {
      const [perm] = await db.query(
        'SELECT 1 FROM dashboard_permissions WHERE user_id = ? AND dashboard_id = ?',
        [req.user?.id, req.params.id]
      );
      if (!perm || perm.length === 0)
        return res.status(403).json({ error: 'Acesso não autorizado a este dashboard' });
    }

    res.json(parseRow(rows[0]));
  } catch (err) {
    console.error('[dashboards/GET /:id]', err);
    res.status(500).json({ error: 'Erro interno ao buscar dashboard' });
  }
});

// POST / — A1: admin only
router.post('/', adminOnly, async (req, res) => {
  try {
    const { nome, descricao, sql_query, chart_sql_query, params, chart_type, links, actions, column_hints, refresh_interval, connection_id } = req.body;

    // M7/N2/N7 — Validar campos obrigatórios, tipos e tamanhos
    if (!nome || !sql_query) return res.status(400).json({ error: 'Nome e sql_query são obrigatórios' });
    if (typeof nome !== 'string' || nome.length > 255)
      return res.status(400).json({ error: 'Nome inválido (máx 255 caracteres)' });
    if (typeof sql_query !== 'string' || sql_query.length > MAX_SQL_LENGTH)
      return res.status(400).json({ error: 'sql_query muito longo (máx 50 KB)' });

    let descricaoVal;
    try { descricaoVal = validateDescricao(descricao); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    let validatedLinks, validatedActions;
    try {
      validatedLinks   = validateLinks(links);
      validatedActions = validateActions(actions);
    } catch (e) { return res.status(400).json({ error: e.message }); }

    const chartSql = chart_sql_query && String(chart_sql_query).trim() ? String(chart_sql_query).trim() : null;
    if (chartSql && chartSql.length > MAX_SQL_LENGTH)
      return res.status(400).json({ error: 'chart_sql_query muito longo (máx 50 KB)' });

    const hintsVal = column_hints && typeof column_hints === 'object' && !Array.isArray(column_hints)
      ? JSON.stringify(column_hints) : null;
    const refreshVal = Math.max(0, parseInt(refresh_interval) || 0);
    const connId = connection_id ? (parseInt(connection_id) || null) : null;

    const [result] = await db.query(
      'INSERT INTO dashboards (nome, descricao, sql_query, chart_sql_query, params, chart_type, links, actions, column_hints, refresh_interval, connection_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, descricaoVal, sql_query, chartSql, serializeParams(params), chart_type || 'bar', serializeLinks(validatedLinks), serializeActions(validatedActions), hintsVal, refreshVal, connId]
    );
    const [rows] = await db.query(
      'SELECT id, nome, descricao, sql_query, chart_sql_query, params, chart_type, links, actions, chart_config, column_hints, refresh_interval, connection_id, created_at, updated_at FROM dashboards WHERE id = ?',
      [result.insertId]
    );
    await auditLog(req, 'create', 'dashboard', result.insertId, nome);
    res.status(201).json(parseRow(rows[0]));
  } catch (err) {
    console.error('[dashboards/POST /]', err);
    res.status(500).json({ error: 'Erro interno ao criar dashboard' });
  }
});

// PUT /:id — A1: admin only
router.put('/:id', adminOnly, validateId, async (req, res) => {
  try {
    const { nome, descricao, sql_query, chart_sql_query, params, chart_type, links, actions, column_hints, refresh_interval, connection_id } = req.body;

    // M7/N2/N7 — Validar campos obrigatórios, tipos e tamanhos
    if (!nome || !sql_query) return res.status(400).json({ error: 'Nome e sql_query são obrigatórios' });
    if (typeof nome !== 'string' || nome.length > 255)
      return res.status(400).json({ error: 'Nome inválido (máx 255 caracteres)' });
    if (typeof sql_query !== 'string' || sql_query.length > MAX_SQL_LENGTH)
      return res.status(400).json({ error: 'sql_query muito longo (máx 50 KB)' });

    let descricaoVal;
    try { descricaoVal = validateDescricao(descricao); }
    catch (e) { return res.status(400).json({ error: e.message }); }

    let validatedLinks, validatedActions;
    try {
      validatedLinks   = validateLinks(links);
      validatedActions = validateActions(actions);
    } catch (e) { return res.status(400).json({ error: e.message }); }

    const chartSql = chart_sql_query && String(chart_sql_query).trim() ? String(chart_sql_query).trim() : null;
    if (chartSql && chartSql.length > MAX_SQL_LENGTH)
      return res.status(400).json({ error: 'chart_sql_query muito longo (máx 50 KB)' });

    const hintsVal = column_hints && typeof column_hints === 'object' && !Array.isArray(column_hints)
      ? JSON.stringify(column_hints) : null;
    const refreshVal = Math.max(0, parseInt(refresh_interval) || 0);
    const connId = connection_id ? (parseInt(connection_id) || null) : null;

    const [result] = await db.query(
      'UPDATE dashboards SET nome = ?, descricao = ?, sql_query = ?, chart_sql_query = ?, params = ?, chart_type = ?, links = ?, actions = ?, column_hints = ?, refresh_interval = ?, connection_id = ? WHERE id = ?',
      [nome, descricaoVal, sql_query, chartSql, serializeParams(params), chart_type || 'bar', serializeLinks(validatedLinks), serializeActions(validatedActions), hintsVal, refreshVal, connId, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Dashboard not found' });

    const [rows] = await db.query(
      'SELECT id, nome, descricao, sql_query, chart_sql_query, params, chart_type, links, actions, chart_config, column_hints, refresh_interval, connection_id, created_at, updated_at FROM dashboards WHERE id = ?',
      [req.params.id]
    );
    await auditLog(req, 'update', 'dashboard', Number(req.params.id), nome);
    res.json(parseRow(rows[0]));
  } catch (err) {
    console.error('[dashboards/PUT /:id]', err);
    res.status(500).json({ error: 'Erro interno ao atualizar dashboard' });
  }
});

// PATCH /:id/chart-config — A1: admin only; M6: validar estrutura
router.patch('/:id/chart-config', adminOnly, validateId, async (req, res) => {
  try {
    const { chart_config } = req.body;

    // M6 — Validar estrutura do chart_config
    if (chart_config !== null && chart_config !== undefined) {
      if (typeof chart_config !== 'object' || Array.isArray(chart_config))
        return res.status(400).json({ error: 'chart_config deve ser um objeto' });
      if (chart_config.labelCol !== undefined && typeof chart_config.labelCol !== 'string')
        return res.status(400).json({ error: 'chart_config.labelCol deve ser string' });
      if (chart_config.valueCols !== undefined && !Array.isArray(chart_config.valueCols))
        return res.status(400).json({ error: 'chart_config.valueCols deve ser array' });
    }

    const value = chart_config ? JSON.stringify(chart_config) : null;
    const [result] = await db.query(
      'UPDATE dashboards SET chart_config = ? WHERE id = ?',
      [value, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Dashboard not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[dashboards/PATCH /:id/chart-config]', err);
    res.status(500).json({ error: 'Erro interno ao salvar configuração do gráfico' });
  }
});

// DELETE /:id — A1: admin only
router.delete('/:id', adminOnly, validateId, async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM dashboards WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Dashboard not found' });
    await auditLog(req, 'delete', 'dashboard', Number(req.params.id));
    res.json({ message: 'Dashboard deleted successfully' });
  } catch (err) {
    console.error('[dashboards/DELETE /:id]', err);
    res.status(500).json({ error: 'Erro interno ao excluir dashboard' });
  }
});

module.exports = router;
