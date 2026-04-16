const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const db       = require('../db');
const auth     = require('../middleware/auth');
const { auditLog } = require('../audit');

// ── migrations ────────────────────────────────────────────────────────────────
async function ensureSchema() {
  try {
    await db.query(`ALTER TABLE gvmdash_users ADD COLUMN nivel ENUM('admin','usuario') NOT NULL DEFAULT 'usuario'`);
    console.log('[users] nivel column added');
  } catch (e) {
    if (!e.message.toLowerCase().includes('duplicate')) console.error('[users] migration nivel:', e.message);
  }

  try {
    await db.query(`ALTER TABLE gvmdash_users ADD COLUMN nome VARCHAR(255) DEFAULT NULL`);
    console.log('[users] nome column added');
  } catch (e) {
    if (!e.message.toLowerCase().includes('duplicate')) console.error('[users] migration nome:', e.message);
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS dashboard_permissions (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      INT NOT NULL,
      dashboard_id INT NOT NULL,
      UNIQUE KEY uk_user_dash (user_id, dashboard_id)
    )
  `);
}
ensureSchema();

// ── admin-only guard ──────────────────────────────────────────────────────────
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

router.use(auth);

// GET / — list users
router.get('/', adminOnly, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, usuario, nome, nivel, ativo, created_at FROM gvmdash_users ORDER BY nome, usuario'
    );
    res.json(rows);
  } catch (err) {
    console.error('[users/GET /]', err);
    res.status(500).json({ error: 'Erro interno ao listar usuários' });
  }
});

// GET /:id — single user
router.get('/:id', adminOnly, validateId, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, usuario, nome, nivel, ativo FROM gvmdash_users WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[users/GET /:id]', err);
    res.status(500).json({ error: 'Erro interno ao buscar usuário' });
  }
});

// N4 — Username: apenas alfanuméricos, ponto e underscore, 3-50 chars
const USUARIO_RE = /^[a-zA-Z0-9._]{3,50}$/;

// POST / — create user
router.post('/', adminOnly, async (req, res) => {
  try {
    const { usuario, nome, senha, nivel = 'usuario', ativo = true } = req.body;
    if (!usuario || !senha)
      return res.status(400).json({ error: 'usuario e senha são obrigatórios' });

    // N4 — Validar formato do username
    if (!USUARIO_RE.test(String(usuario)))
      return res.status(400).json({ error: 'Usuário inválido (3-50 chars: letras, números, . e _)' });

    // M2 — Validar tamanho mínimo de senha
    if (String(senha).length < 8)
      return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres' });

    const hash = await bcrypt.hash(String(senha), 10);
    const [result] = await db.query(
      'INSERT INTO gvmdash_users (usuario, nome, senha, nivel, ativo) VALUES (?, ?, ?, ?, ?)',
      [usuario, nome || usuario, hash, nivel, ativo ? 1 : 0]
    );
    const [rows] = await db.query(
      'SELECT id, usuario, nome, nivel, ativo FROM gvmdash_users WHERE id = ?',
      [result.insertId]
    );
    await auditLog(req, 'create', 'user', result.insertId, usuario);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Nome de usuário já existe' });
    console.error('[users/POST /]', err);
    res.status(500).json({ error: 'Erro interno ao criar usuário' });
  }
});

// PUT /:id — update user
router.put('/:id', adminOnly, validateId, async (req, res) => {
  try {
    const { usuario, nome, senha, nivel, ativo } = req.body;
    if (!usuario) return res.status(400).json({ error: 'usuario é obrigatório' });

    // N4 — Validar formato do username
    if (!USUARIO_RE.test(String(usuario)))
      return res.status(400).json({ error: 'Usuário inválido (3-50 chars: letras, números, . e _)' });

    if (senha && String(senha).trim()) {
      // M2 — Validar tamanho mínimo de senha ao alterar
      if (String(senha).length < 8)
        return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres' });

      const hash = await bcrypt.hash(String(senha), 10);
      await db.query(
        'UPDATE gvmdash_users SET usuario=?, nome=?, senha=?, nivel=?, ativo=? WHERE id=?',
        [usuario, nome || usuario, hash, nivel || 'usuario', ativo ? 1 : 0, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE gvmdash_users SET usuario=?, nome=?, nivel=?, ativo=? WHERE id=?',
        [usuario, nome || usuario, nivel || 'usuario', ativo ? 1 : 0, req.params.id]
      );
    }

    const [rows] = await db.query(
      'SELECT id, usuario, nome, nivel, ativo FROM gvmdash_users WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    await auditLog(req, 'update', 'user', Number(req.params.id), usuario);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'Nome de usuário já existe' });
    console.error('[users/PUT /:id]', err);
    res.status(500).json({ error: 'Erro interno ao atualizar usuário' });
  }
});

// DELETE /:id — delete user
router.delete('/:id', adminOnly, validateId, async (req, res) => {
  try {
    if (Number(req.params.id) === req.user.id)
      return res.status(400).json({ error: 'Não é possível excluir o próprio usuário' });

    const [result] = await db.query('DELETE FROM gvmdash_users WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Usuário não encontrado' });

    await auditLog(req, 'delete', 'user', Number(req.params.id));
    res.json({ message: 'Usuário excluído com sucesso' });
  } catch (err) {
    console.error('[users/DELETE /:id]', err);
    res.status(500).json({ error: 'Erro interno ao excluir usuário' });
  }
});

// GET /:id/permissions — dashboard IDs allowed for user
router.get('/:id/permissions', adminOnly, validateId, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT dashboard_id FROM dashboard_permissions WHERE user_id = ?',
      [req.params.id]
    );
    res.json(rows.map(r => r.dashboard_id));
  } catch (err) {
    console.error('[users/GET /:id/permissions]', err);
    res.status(500).json({ error: 'Erro interno ao buscar permissões' });
  }
});

// PUT /:id/permissions — replace all permissions for user
router.put('/:id/permissions', adminOnly, validateId, async (req, res) => {
  try {
    const { dashboard_ids } = req.body;
    const userId = Number(req.params.id);

    // M8 — Validar que todos os itens são inteiros positivos; limitar array
    if (Array.isArray(dashboard_ids)) {
      if (dashboard_ids.length > 500)
        return res.status(400).json({ error: 'Limite de 500 permissões por usuário' });

      const invalid = dashboard_ids.some(id => !Number.isInteger(Number(id)) || Number(id) <= 0);
      if (invalid)
        return res.status(400).json({ error: 'dashboard_ids contém valores inválidos' });
    }

    await db.query('DELETE FROM dashboard_permissions WHERE user_id = ?', [userId]);

    if (Array.isArray(dashboard_ids) && dashboard_ids.length > 0) {
      const values = dashboard_ids.map(did => [userId, Number(did)]);
      await db.query('INSERT INTO dashboard_permissions (user_id, dashboard_id) VALUES ?', [values]);
    }

    const [rows] = await db.query(
      'SELECT dashboard_id FROM dashboard_permissions WHERE user_id = ?',
      [userId]
    );
    // N6 — Audit log para alteração de permissões
    await auditLog(req, 'update_permissions', 'user', userId, `dashboards: ${rows.map(r => r.dashboard_id).join(',') || 'none'}`);
    res.json(rows.map(r => r.dashboard_id));
  } catch (err) {
    console.error('[users/PUT /:id/permissions]', err);
    res.status(500).json({ error: 'Erro interno ao salvar permissões' });
  }
});

module.exports = router;
