const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const rateLimit  = require('express-rate-limit');
const db         = require('../db');
const auth       = require('../middleware/auth');
const tokenStore = require('../middleware/tokenStore');
const { auditLog } = require('../audit');

// A6 — Rate limiting no login (10 tentativas por 15 min por IP)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const body      = req.body;
    const inputUser = body.usuario || body.username || '';
    const inputPass = body.senha   || body.password  || '';

    if (!inputUser || !inputPass)
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });

    const [rows] = await db.query(
      'SELECT * FROM gvmdash_users WHERE usuario = ? AND ativo = 1',
      [inputUser]
    );

    if (!rows || rows.length === 0)
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });

    const user    = rows[0];
    const isValid = await bcrypt.compare(inputPass, user.senha);

    if (!isValid)
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });

    const nivel = user.nivel || 'usuario';

    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, nome: user.nome, nivel },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '8h' }
    );

    // M10 — Audit log
    req.user = { id: user.id, usuario: user.usuario };
    await auditLog(req, 'login', 'session', user.id);

    res.json({
      token,
      user: { id: user.id, usuario: user.usuario, nome: user.nome, nivel },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Erro interno ao autenticar' });
  }
});

// M3 — Logout: revoga o token atual
router.post('/logout', auth, async (req, res) => {
  try {
    const token   = req._token;
    const decoded = req.user;
    // Calcular expiração real do token para poder limpar do blacklist depois
    const expiresAt = decoded.exp ? decoded.exp * 1000 : Date.now() + 8 * 3600 * 1000;
    tokenStore.revoke(token, expiresAt);

    // M10 — Audit log
    await auditLog(req, 'logout', 'session', req.user.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/logout]', err);
    res.status(500).json({ error: 'Erro interno ao fazer logout' });
  }
});

module.exports = router;
