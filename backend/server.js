require('dotenv').config();

// C1 — Validar JWT_SECRET na inicialização
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET ausente ou muito curto (mínimo 32 caracteres). Encerrando.');
  process.exit(1);
}

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');

const app = express();

// A7 — Security headers
app.use(helmet());

// M4 / N3 — CORS configurado via variável de ambiente; falha se vazio
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.error('[FATAL] ALLOWED_ORIGINS ausente ou vazio no .env. Configure ao menos uma origem permitida.');
  process.exit(1);
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/users',       require('./routes/users'));
app.use('/api/dashboards',  require('./routes/dashboards'));
app.use('/api/query',       require('./routes/query'));
app.use('/api/attachments', require('./routes/attachments'));
app.use('/api/logs',        require('./routes/logs'));
app.use('/api/connections', require('./routes/connections'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public config (frontend reads PAGE_SIZE and DASH_REFRESH from here)
app.get('/api/config', (req, res) => {
  res.json({
    pageSize:    Math.max(1, parseInt(process.env.PAGE_SIZE    || '50', 10)),
    dashRefresh: Math.max(0, parseInt(process.env.DASH_REFRESH || '0',  10)),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// M1 — Error handler sem expor internos ao cliente
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(err.status || 500).json({ error: 'Erro interno no servidor' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[Server] GVM Dashboard backend running on port ${PORT}`);
});
