const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const crypto     = require('crypto');
const rateLimit  = require('express-rate-limit');
const db         = require('../db');
const auth       = require('../middleware/auth');
const { auditLog } = require('../audit');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// A2 — Tipos MIME permitidos e tamanho máximo de 20 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/jpeg',
  'image/png',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-zip-compressed',
];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext    = path.extname(file.originalname).toLowerCase();
    const unique = crypto.randomBytes(16).toString('hex');
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Tipo de arquivo não permitido'));
    }
    cb(null, true);
  },
});

// A6 — Rate limiting para upload (20 uploads/min por IP)
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitos uploads. Tente novamente em 1 minuto.' },
});

// ── table migration ───────────────────────────────────────────────────────────
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS dashboard_attachments (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      dashboard_id  INT NOT NULL,
      filename      VARCHAR(255) NOT NULL,
      original_name VARCHAR(500) NOT NULL,
      size          INT NOT NULL DEFAULT 0,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dashboard (dashboard_id)
    )
  `);
}
ensureTable();

router.use(auth);

// M5 — Validar ID numérico
function validateDashboardId(req, res, next) {
  const id = Number(req.params.dashboardId);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: 'ID de dashboard inválido' });
  next();
}

function validateFileId(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0)
    return res.status(400).json({ error: 'ID de arquivo inválido' });
  next();
}

// A3/A4 — Verificar permissão do usuário no dashboard
async function checkDashboardPermission(userId, nivel, dashboardId) {
  if (nivel === 'admin') return true;
  const [rows] = await db.query(
    'SELECT 1 FROM dashboard_permissions WHERE user_id = ? AND dashboard_id = ?',
    [userId, dashboardId]
  );
  return rows && rows.length > 0;
}

// GET /:dashboardId — lista arquivos do dashboard
router.get('/:dashboardId', validateDashboardId, async (req, res) => {
  try {
    // A4 — Verificar permissão antes de listar
    const hasPermission = await checkDashboardPermission(
      req.user.id, req.user.nivel, req.params.dashboardId
    );
    if (!hasPermission)
      return res.status(403).json({ error: 'Acesso não autorizado a este dashboard' });

    const [rows] = await db.query(
      'SELECT id, filename, original_name, size, created_at FROM dashboard_attachments WHERE dashboard_id = ? ORDER BY created_at DESC',
      [req.params.dashboardId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[attachments/GET /:dashboardId]', err);
    res.status(500).json({ error: 'Erro interno ao listar arquivos' });
  }
});

// POST /:dashboardId — upload de arquivo
router.post('/:dashboardId', uploadLimiter, validateDashboardId, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  try {
    // A3 — Verificar permissão antes de aceitar upload
    const hasPermission = await checkDashboardPermission(
      req.user.id, req.user.nivel, req.params.dashboardId
    );
    if (!hasPermission) {
      fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
      return res.status(403).json({ error: 'Acesso não autorizado a este dashboard' });
    }

    const { originalname, filename, size } = req.file;
    const [result] = await db.query(
      'INSERT INTO dashboard_attachments (dashboard_id, filename, original_name, size) VALUES (?, ?, ?, ?)',
      [req.params.dashboardId, filename, originalname, size]
    );
    await auditLog(req, 'upload', 'attachment', result.insertId, `dashboard:${req.params.dashboardId} file:${originalname}`);
    res.status(201).json({ id: result.insertId, filename, original_name: originalname, size });
  } catch (err) {
    fs.unlink(path.join(UPLOADS_DIR, req.file.filename), () => {});
    console.error('[attachments/POST /:dashboardId]', err);
    res.status(500).json({ error: 'Erro interno ao fazer upload' });
  }
});

// GET /file/:id/download — download do arquivo
router.get('/file/:id/download', validateFileId, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT filename, original_name, dashboard_id FROM dashboard_attachments WHERE id = ?',
      [req.params.id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Arquivo não encontrado' });

    const { filename, original_name, dashboard_id } = rows[0];

    // A4 — Verificar permissão no dashboard do arquivo
    const hasPermission = await checkDashboardPermission(
      req.user.id, req.user.nivel, dashboard_id
    );
    if (!hasPermission)
      return res.status(403).json({ error: 'Acesso não autorizado' });

    // A5 — Sanitizar filename para evitar path traversal
    const sanitized = path.basename(filename);
    const filePath  = path.join(UPLOADS_DIR, sanitized);
    const resolved  = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
      return res.status(400).json({ error: 'Caminho inválido' });
    }

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });
    res.download(filePath, original_name);
  } catch (err) {
    console.error('[attachments/GET /file/:id/download]', err);
    res.status(500).json({ error: 'Erro interno ao baixar arquivo' });
  }
});

// DELETE /file/:id — remove arquivo (admin only)
router.delete('/file/:id', validateFileId, async (req, res) => {
  if (req.user?.nivel !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  try {
    const [rows] = await db.query(
      'SELECT filename FROM dashboard_attachments WHERE id = ?',
      [req.params.id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Arquivo não encontrado' });
    await db.query('DELETE FROM dashboard_attachments WHERE id = ?', [req.params.id]);
    fs.unlink(path.join(UPLOADS_DIR, rows[0].filename), () => {});
    await auditLog(req, 'delete', 'attachment', Number(req.params.id));
    res.json({ message: 'Arquivo removido' });
  } catch (err) {
    console.error('[attachments/DELETE /file/:id]', err);
    res.status(500).json({ error: 'Erro interno ao remover arquivo' });
  }
});

module.exports = router;
