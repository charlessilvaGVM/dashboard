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
    CREATE TABLE IF NOT EXISTS db_connections (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      nome       VARCHAR(255) NOT NULL,
      host       VARCHAR(255) NOT NULL,
      port       INT DEFAULT 3306,
      \`database\` VARCHAR(255) NOT NULL,
      user       VARCHAR(255) NOT NULL,
      password   VARCHAR(255) NOT NULL DEFAULT '',
      ativo      TINYINT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
ensureTable();

// GET / — list all connections (password hidden)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nome, host, port, `database`, user, ativo, created_at FROM db_connections ORDER BY nome'
    );
    res.json(rows);
  } catch (err) {
    console.error('[connections/GET /]', err);
    res.status(500).json({ error: 'Erro ao listar conexões' });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const [rows] = await db.query(
      'SELECT id, nome, host, port, `database`, user, ativo, created_at FROM db_connections WHERE id = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Conexão não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[connections/GET /:id]', err);
    res.status(500).json({ error: 'Erro ao buscar conexão' });
  }
});

// POST / — create
router.post('/', async (req, res) => {
  const { nome, host, port, database, user, password, ativo } = req.body;
  if (!nome || !host || !database || !user)
    return res.status(400).json({ error: 'nome, host, database e user são obrigatórios' });
  try {
    const [result] = await db.query(
      'INSERT INTO db_connections (nome, host, port, `database`, user, password, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nome.trim(), host.trim(), parseInt(port) || 3306, database.trim(), user.trim(), password || '', ativo !== false ? 1 : 0]
    );
    const [rows] = await db.query(
      'SELECT id, nome, host, port, `database`, user, ativo, created_at FROM db_connections WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[connections/POST /]', err);
    res.status(500).json({ error: 'Erro ao criar conexão' });
  }
});

// PUT /:id — update
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  const { nome, host, port, database, user, password, ativo } = req.body;
  if (!nome || !host || !database || !user)
    return res.status(400).json({ error: 'nome, host, database e user são obrigatórios' });
  try {
    // if password is blank, keep existing
    let query, vals;
    if (password && password.trim()) {
      query = 'UPDATE db_connections SET nome=?, host=?, port=?, `database`=?, user=?, password=?, ativo=? WHERE id=?';
      vals  = [nome.trim(), host.trim(), parseInt(port)||3306, database.trim(), user.trim(), password.trim(), ativo!==false?1:0, id];
    } else {
      query = 'UPDATE db_connections SET nome=?, host=?, port=?, `database`=?, user=?, ativo=? WHERE id=?';
      vals  = [nome.trim(), host.trim(), parseInt(port)||3306, database.trim(), user.trim(), ativo!==false?1:0, id];
    }
    const [result] = await db.query(query, vals);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Conexão não encontrada' });
    db.invalidateConnectionPool(id);
    const [rows] = await db.query(
      'SELECT id, nome, host, port, `database`, user, ativo, created_at FROM db_connections WHERE id = ?',
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[connections/PUT /:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar conexão' });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const [result] = await db.query('DELETE FROM db_connections WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Conexão não encontrada' });
    db.invalidateConnectionPool(id);
    res.json({ message: 'Conexão excluída' });
  } catch (err) {
    console.error('[connections/DELETE /:id]', err);
    res.status(500).json({ error: 'Erro ao excluir conexão' });
  }
});

// POST /:id/test — test connectivity
router.post('/:id/test', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    db.invalidateConnectionPool(id); // force reload
    const pool = await db.getPoolForConnection(id);
    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
    res.json({ ok: true, message: 'Conexão bem-sucedida' });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
});

module.exports = router;
