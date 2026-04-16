// M3 — In-memory token revocation store
const crypto = require('crypto');

// Map<tokenHash, expiresAt (ms)>
const _revoked = new Map();

function _hash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Clean up expired entries every hour
setInterval(() => {
  const now = Date.now();
  for (const [h, exp] of _revoked) {
    if (exp < now) _revoked.delete(h);
  }
}, 60 * 60 * 1000);

module.exports = {
  revoke(token, expiresAt) {
    _revoked.set(_hash(token), expiresAt);
  },
  isRevoked(token) {
    const h = _hash(token);
    if (!_revoked.has(h)) return false;
    if (_revoked.get(h) < Date.now()) {
      _revoked.delete(h);
      return false;
    }
    return true;
  },
};
