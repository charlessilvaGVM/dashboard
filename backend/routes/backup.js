const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const db      = require('../db');
const auth    = require('../middleware/auth');
const { auditLog } = require('../audit');

router.use(auth);

const adminOnly = (req, res, next) => {
  if (req.user?.nivel !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
  next();
};
router.use(adminOnly);

// ── XML helpers ──────────────────────────────────────────────
function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function xmlField(tag, value, ind = '      ') {
  if (value == null || value === '') return `${ind}<${tag}/>`;
  // mysql2 pode retornar colunas JSON como objeto JS — serializa de volta para string
  const s = (value !== null && typeof value === 'object') ? JSON.stringify(value) : String(value);
  if (!s || s === 'null') return `${ind}<${tag}/>`;
  if (/[<>&"'\n\r]/.test(s)) {
    // ]]> é ilegal dentro de CDATA — divide em múltiplos blocos
    const safe = s.replace(/]]>/g, ']]]]><![CDATA[>');
    return `${ind}<${tag}><![CDATA[${safe}]]></${tag}>`;
  }
  return `${ind}<${tag}>${escapeXml(s)}</${tag}>`;
}

// Retorna null se val é undefined/null/vazio, string original caso contrário
function orNull(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

// Valida JSON — retorna string se válido, null se inválido/vazio
function safeJson(val) {
  const s = orNull(val);
  if (s === null) return null;
  try { JSON.parse(s); return s; } catch { return null; }
}

function extractField(xml, tag) {
  // CDATA (greedy até o último ]]> antes do fechamento da tag)
  const cdataM = xml.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i'));
  if (cdataM) {
    // Desfaz o escape de ]]> feito no export
    return cdataM[1].replace(/\]\]]]><!\[CDATA\[>/g, ']]>');
  }
  if (new RegExp(`<${tag}\\s*/>`, 'i').test(xml)) return null;
  const textM = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
  if (textM) return textM[1].trim() || null;
  return null; // não encontrado → null (não undefined)
}

function extractBlocks(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

// ── POST /export ─────────────────────────────────────────────
// Body: { ids?: number[] }  — se ids vazio/ausente exporta tudo
router.post('/export', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];

    let dashboards;
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      [dashboards] = await db.query(
        `SELECT nome, descricao, sql_query, chart_type, chart_sql_query,
                params, chart_config, links, actions, expand_config,
                column_hints, extra_charts, refresh_interval, connection_id
         FROM gvmdash_dashboards WHERE id IN (${placeholders}) ORDER BY id`,
        ids
      );
    } else {
      [dashboards] = await db.query(
        `SELECT nome, descricao, sql_query, chart_type, chart_sql_query,
                params, chart_config, links, actions, expand_config,
                column_hints, extra_charts, refresh_interval, connection_id
         FROM gvmdash_dashboards ORDER BY id`
      );
    }

    // Inclui apenas conexões referenciadas pelos dashboards exportados
    const connIds = [...new Set(dashboards.map(d => d.connection_id).filter(Boolean))];
    let connections = [];
    if (connIds.length > 0) {
      const placeholders = connIds.map(() => '?').join(',');
      [connections] = await db.query(
        `SELECT nome, host, port, \`database\`, \`user\`, password, ativo
         FROM gvmdash_connections WHERE id IN (${placeholders}) ORDER BY id`,
        connIds
      );
    }

    const now = new Date().toISOString();
    const lines = [];

    lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    lines.push(`<gvmdashboard version="1" exported_at="${now}">`);

    lines.push(`  <dashboards count="${dashboards.length}">`);
    for (const d of dashboards) {
      lines.push(`    <dashboard>`);
      lines.push(xmlField('nome',             d.nome));
      lines.push(xmlField('descricao',        d.descricao));
      lines.push(xmlField('sql_query',        d.sql_query));
      lines.push(xmlField('chart_type',       d.chart_type));
      lines.push(xmlField('chart_sql_query',  d.chart_sql_query));
      lines.push(xmlField('params',           d.params));
      lines.push(xmlField('chart_config',     d.chart_config));
      lines.push(xmlField('links',            d.links));
      lines.push(xmlField('actions',          d.actions));
      lines.push(xmlField('expand_config',    d.expand_config));
      lines.push(xmlField('column_hints',     d.column_hints));
      lines.push(xmlField('extra_charts',     d.extra_charts));
      lines.push(xmlField('refresh_interval', d.refresh_interval ?? 0));
      lines.push(xmlField('connection_id',    d.connection_id));
      lines.push(`    </dashboard>`);
    }
    lines.push(`  </dashboards>`);

    lines.push(`  <connections count="${connections.length}">`);
    for (const c of connections) {
      lines.push(`    <connection>`);
      lines.push(xmlField('nome',     c.nome));
      lines.push(xmlField('host',     c.host));
      lines.push(xmlField('port',     c.port));
      lines.push(xmlField('database', c.database));
      lines.push(xmlField('user',     c.user));
      lines.push(xmlField('password', c.password));
      lines.push(xmlField('ativo',    c.ativo));
      lines.push(`    </connection>`);
    }
    lines.push(`  </connections>`);
    lines.push(`</gvmdashboard>`);

    const xml      = lines.join('\n');
    const filename = `gvmdashboard_${now.slice(0, 10)}.xml`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await auditLog(req, 'EXPORT', 'backup', null,
      `${dashboards.length} dashboards, ${connections.length} conexões`);

    res.send(xml);
  } catch (err) {
    console.error('[backup/export]', err);
    res.status(500).json({ error: 'Erro ao gerar backup' });
  }
});

// ── Upload em memória (max 10 MB) ────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── POST /import/preview ─────────────────────────────────────
router.post('/import/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  try {
    const xml = req.file.buffer.toString('utf8');
    if (!xml.includes('<gvmdashboard')) {
      return res.status(400).json({ error: 'Arquivo inválido — não é um backup GVM Dashboard' });
    }

    const dashBlocks = extractBlocks(xml, 'dashboard');
    const connBlocks = extractBlocks(xml, 'connection');

    const [existingDash] = await db.query('SELECT nome FROM gvmdash_dashboards');
    const [existingConn] = await db.query('SELECT nome FROM gvmdash_connections');
    const existDashNames = new Set(existingDash.map(d => d.nome));
    const existConnNames = new Set(existingConn.map(c => c.nome));

    const exportedAtM = xml.match(/exported_at="([^"]+)"/);

    res.json({
      exportedAt: exportedAtM ? exportedAtM[1] : null,
      dashboards:  dashBlocks.map(b => ({ nome: extractField(b, 'nome') || '(sem nome)', conflict: existDashNames.has(extractField(b, 'nome')) })),
      connections: connBlocks.map(b => ({ nome: extractField(b, 'nome') || '(sem nome)', conflict: existConnNames.has(extractField(b, 'nome')) })),
    });
  } catch (err) {
    console.error('[backup/import/preview]', err);
    res.status(400).json({ error: 'Erro ao analisar arquivo: ' + err.message });
  }
});

// ── POST /import/execute ─────────────────────────────────────
router.post('/import/execute', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  const mode = req.body.mode === 'overwrite' ? 'overwrite' : 'skip';

  try {
    const xml = req.file.buffer.toString('utf8');
    if (!xml.includes('<gvmdashboard')) {
      return res.status(400).json({ error: 'Arquivo inválido' });
    }

    // ── Conexões ──────────────────────────────────────────────
    const connBlocks = extractBlocks(xml, 'connection');
    let connImported = 0, connSkipped = 0, connOverwritten = 0;

    for (const block of connBlocks) {
      const nome     = extractField(block, 'nome');
      const host     = extractField(block, 'host') || '127.0.0.1';
      const port     = parseInt(extractField(block, 'port') || '3306', 10);
      const database = extractField(block, 'database') || '';
      const user     = extractField(block, 'user') || '';
      const password = extractField(block, 'password') || '';
      const ativo    = parseInt(extractField(block, 'ativo') ?? '1', 10);

      const [exists] = await db.query('SELECT id FROM gvmdash_connections WHERE nome = ?', [nome]);

      if (exists.length > 0) {
        if (mode === 'skip') { connSkipped++; continue; }
        await db.query(
          'UPDATE gvmdash_connections SET host=?, port=?, `database`=?, `user`=?, password=?, ativo=? WHERE nome=?',
          [host, port, database, user, password, ativo, nome]
        );
        connOverwritten++;
      } else {
        await db.query(
          'INSERT INTO gvmdash_connections (nome, host, port, `database`, `user`, password, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [nome, host, port, database, user, password, ativo]
        );
        connImported++;
      }
    }

    // ── Dashboards ────────────────────────────────────────────
    const dashBlocks = extractBlocks(xml, 'dashboard');
    let dashImported = 0, dashSkipped = 0, dashOverwritten = 0;

    for (const block of dashBlocks) {
      const nome             = orNull(extractField(block, 'nome')) || 'Dashboard importado';
      const descricao        = orNull(extractField(block, 'descricao'));
      const sql_query        = orNull(extractField(block, 'sql_query')) || 'SELECT 1';
      const chart_type       = orNull(extractField(block, 'chart_type')) || 'none';
      const chart_sql_query  = orNull(extractField(block, 'chart_sql_query'));
      const params           = safeJson(extractField(block, 'params'));
      const chart_config     = safeJson(extractField(block, 'chart_config'));
      const links            = safeJson(extractField(block, 'links'));
      const actions          = safeJson(extractField(block, 'actions'));
      const expand_config    = safeJson(extractField(block, 'expand_config'));
      const column_hints     = safeJson(extractField(block, 'column_hints'));
      const extra_charts     = safeJson(extractField(block, 'extra_charts'));
      const refresh_interval = parseInt(orNull(extractField(block, 'refresh_interval')) || '0', 10);

      const [exists] = await db.query('SELECT id FROM gvmdash_dashboards WHERE nome = ?', [nome]);

      if (exists.length > 0) {
        if (mode === 'skip') { dashSkipped++; continue; }
        await db.query(
          `UPDATE gvmdash_dashboards
           SET descricao=?, sql_query=?, chart_type=?, chart_sql_query=?,
               params=?, chart_config=?, links=?, actions=?, expand_config=?,
               column_hints=?, extra_charts=?, refresh_interval=?, connection_id=NULL
           WHERE nome=?`,
          [descricao, sql_query, chart_type, chart_sql_query, params, chart_config,
           links, actions, expand_config, column_hints, extra_charts, refresh_interval, nome]
        );
        dashOverwritten++;
      } else {
        await db.query(
          `INSERT INTO gvmdash_dashboards
           (nome, descricao, sql_query, chart_type, chart_sql_query, params, chart_config,
            links, actions, expand_config, column_hints, extra_charts, refresh_interval, connection_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [nome, descricao, sql_query, chart_type, chart_sql_query, params, chart_config,
           links, actions, expand_config, column_hints, extra_charts, refresh_interval]
        );
        dashImported++;
      }
    }

    await auditLog(req, 'IMPORT', 'backup', null,
      `modo:${mode} | dashboards: +${dashImported} sobrescritos:${dashOverwritten} ignorados:${dashSkipped} | conexões: +${connImported} sobrescritas:${connOverwritten} ignoradas:${connSkipped}`
    );

    res.json({
      success: true,
      mode,
      dashboards:  { imported: dashImported,  overwritten: dashOverwritten,  skipped: dashSkipped },
      connections: { imported: connImported,   overwritten: connOverwritten,  skipped: connSkipped },
    });
  } catch (err) {
    console.error('[backup/import/execute]', err);
    res.status(500).json({ error: 'Erro ao importar: ' + err.message });
  }
});

module.exports = router;
