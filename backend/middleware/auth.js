const jwt        = require('jsonwebtoken');
const tokenStore = require('./tokenStore');

module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header provided' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Invalid authorization format. Use: Bearer <token>' });
  }

  const token = parts[1];

  // M3 — Verificar se o token foi revogado (logout)
  if (tokenStore.isRevoked(token)) {
    return res.status(401).json({ error: 'Token revogado' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user  = decoded;
    req._token = token; // para uso no logout
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};
