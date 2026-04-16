// M10 — Audit log helper
const db = require('./db');

async function ensureAuditTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     INT,
      usuario     VARCHAR(100),
      action      VARCHAR(50)  NOT NULL,
      resource    VARCHAR(50)  NOT NULL,
      resource_id INT,
      detail      TEXT,
      ip          VARCHAR(45),
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created (created_at),
      INDEX idx_user    (user_id)
    )
  `);
}
ensureAuditTable().catch(e => console.error('[audit] table init:', e.message));

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || '')
    .toString().split(',')[0].trim().slice(0, 45);
}

async function auditLog(req, action, resource, resourceId = null, detail = null) {
  try {
    await db.query(
      'INSERT INTO audit_logs (user_id, usuario, action, resource, resource_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user?.id ?? null, req.user?.usuario ?? null, action, resource, resourceId, detail, getIp(req)]
    );
  } catch (e) {
    console.error('[audit]', e.message);
  }
}

module.exports = { auditLog };
