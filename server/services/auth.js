const crypto = require('crypto');
const { db, logActivity } = require('../db');

// Secret for signing session tokens
const AUTH_SECRET = process.env.AUTH_SECRET || 'lucidmediax_secret_key_2026_growth_intelligence';

class AuthService {
  /**
   * Get active admin password (from database or environment)
   */
  getAdminPassword() {
    try {
      const row = db.prepare("SELECT value FROM system_settings WHERE key = 'admin_password'").get();
      if (row && row.value) {
        return row.value;
      }
    } catch (e) {
      // ignore
    }
    return process.env.ADMIN_PASSWORD || 'lucid2026';
  }

  /**
   * Update admin password
   */
  setAdminPassword(newPassword) {
    if (!newPassword || newPassword.length < 4) {
      throw new Error('Password must be at least 4 characters long');
    }

    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('admin_password', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(newPassword);

    logActivity('security', 'Master admin access password was updated', 'info');
    return true;
  }

  /**
   * Verify password and issue signed session token (valid for 30 days)
   */
  login(password) {
    const currentPassword = this.getAdminPassword();
    if (!password || password.trim() !== currentPassword.trim()) {
      return { success: false, error: 'Incorrect access password' };
    }

    const timestamp = Date.now().toString();
    const signature = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(timestamp + currentPassword.trim())
      .digest('hex');

    const token = Buffer.from(`${timestamp}:${signature}`).toString('base64');
    logActivity('security', 'Successful admin login session initiated', 'info');

    return {
      success: true,
      token,
      expiresInDays: 30
    };
  }

  /**
   * Validates session token
   */
  validateToken(token) {
    if (!token) return false;

    try {
      const decoded = Buffer.from(token, 'base64').toString('utf8');
      const [timestampStr, signature] = decoded.split(':');
      if (!timestampStr || !signature) return false;

      const timestamp = parseInt(timestampStr, 10);
      const ageMs = Date.now() - timestamp;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      // Check age (30 days)
      if (ageMs > thirtyDaysMs || ageMs < 0) return false;

      const currentPassword = this.getAdminPassword().trim();
      const expectedSignature = crypto
        .createHmac('sha256', AUTH_SECRET)
        .update(timestampStr + currentPassword)
        .digest('hex');

      return signature === expectedSignature;
    } catch {
      return false;
    }
  }

  /**
   * Express middleware to enforce authentication
   */
  middleware() {
    return (req, res, next) => {
      const p = req.path;
      const orig = req.originalUrl ? req.originalUrl.split('?')[0] : '';
      
      // Allow auth login & verify routes without token
      if (
        p === '/api/auth/login' || 
        p === '/auth/login' || 
        orig === '/api/auth/login' ||
        p === '/api/auth/verify' || 
        p === '/auth/verify' || 
        orig === '/api/auth/verify'
      ) {
        return next();
      }

      // Check Authorization header or query parameter (for direct file downloads)
      let token = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      } else if (req.query && req.query.auth_token) {
        token = req.query.auth_token;
      }

      if (this.validateToken(token)) {
        return next();
      }

      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Master password authentication required to access LucidMediax Command Center.'
      });
    };
  }
}

module.exports = new AuthService();
