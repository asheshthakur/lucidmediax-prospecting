const https = require('https');

/**
 * Google PageSpeed Insights Adapter
 * Evaluates mobile performance and Core Web Vitals for business prospects
 */
class PageSpeedAdapter {
  constructor(apiKey = process.env.PAGESPEED_API_KEY) {
    this.apiKey = apiKey;
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 10);
  }

  async testConnection() {
    if (!this.isConfigured()) {
      return {
        configured: false,
        status: 'Unconfigured (Optional)',
        message: 'No Google Cloud PageSpeed API key set. Local HTTP and mobile viewport audits are running.'
      };
    }

    return new Promise((resolve) => {
      const testUrl = 'https://www.google.com';
      const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(testUrl)}&key=${this.apiKey}&strategy=mobile`;
      
      https.get(endpoint, { timeout: 8000 }, (res) => {
        if (res.statusCode === 200) {
          resolve({ configured: true, status: 'Connected', message: 'Google PageSpeed Insights API is active.' });
        } else {
          resolve({ configured: false, status: `HTTP ${res.statusCode}`, message: 'PageSpeed API returned an authentication error.' });
        }
      }).on('error', err => resolve({ configured: false, status: 'Error', message: err.message }));
    });
  }

  async auditUrl(targetUrl) {
    if (!this.isConfigured()) return null;

    return new Promise((resolve) => {
      const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&key=${this.apiKey}&strategy=mobile`;
      https.get(endpoint, { timeout: 15000 }, (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const score = Math.round((data.lighthouseResult?.categories?.performance?.score || 0) * 100);
            resolve({
              speedScore: score,
              lcp: data.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue,
              seoScore: Math.round((data.lighthouseResult?.categories?.seo?.score || 0) * 100)
            });
          } catch {
            resolve(null);
          }
        });
      }).on('error', () => resolve(null));
    });
  }
}

module.exports = new PageSpeedAdapter();
