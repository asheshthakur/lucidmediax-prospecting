const https = require('https');
const { logActivity } = require('../db');

/**
 * Apify Actor Adapter
 * Discovers leads via Apify cloud actors when APIFY_TOKEN is supplied
 */
class ApifyAdapter {
  constructor(token = process.env.APIFY_TOKEN) {
    this.token = token;
    this.actorId = 'khadinakbar/google-maps-leads-scraper';
  }

  isConfigured() {
    return Boolean(this.token && this.token.trim().length > 10);
  }

  async testConnection() {
    if (!this.isConfigured()) {
      return {
        configured: false,
        status: 'Missing APIFY_TOKEN',
        message: 'Provide your Apify API Token in .env or Settings to use cloud crawling.'
      };
    }

    return new Promise((resolve) => {
      const req = https.get(
        `https://api.apify.com/v2/users/me?token=${this.token}`,
        { timeout: 6000 },
        (res) => {
          let body = '';
          res.on('data', c => { body += c; });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.data && data.data.username) {
                resolve({
                  configured: true,
                  status: 'Connected',
                  username: data.data.username,
                  message: `Authenticated with Apify account: ${data.data.username}`
                });
              } else {
                resolve({
                  configured: false,
                  status: 'Invalid Token',
                  message: 'Apify returned unauthorized error. Verify your token.'
                });
              }
            } catch (err) {
              resolve({ configured: false, status: 'Error', message: err.message });
            }
          });
        }
      );
      req.on('error', err => resolve({ configured: false, status: 'Connection Error', message: err.message }));
    });
  }
}

module.exports = new ApifyAdapter();
