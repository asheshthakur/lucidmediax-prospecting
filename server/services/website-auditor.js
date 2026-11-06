const dns = require('dns').promises;
const https = require('https');
const http = require('http');
const { logActivity } = require('../db');

/**
 * Validates domain mail server (MX records)
 */
async function verifyDomainMx(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx && mx.length > 0) {
      return { hasMx: true, records: mx.map(m => m.exchange) };
    }
  } catch (err) {
    // MX lookup failed
  }
  return { hasMx: false, records: [] };
}

/**
 * Performs deep audit on business website:
 * - Checks SSL/HTTPS
 * - Extracts meta tags (title, description)
 * - Identifies contact email addresses (filtering noise)
 * - Detects official social profile URLs (Instagram, Facebook, LinkedIn, Twitter/X)
 * - Measures response latency
 */
async function auditWebsite(rawUrl) {
  return new Promise((resolve) => {
    if (!rawUrl || rawUrl.trim().length === 0) {
      return resolve({
        status: 'missing',
        hasSsl: 0,
        emails: [],
        social: {},
        meta: {}
      });
    }

    let target = rawUrl.trim();
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      target = `https://${target}`;
    }

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return resolve({
        status: 'invalid_url',
        hasSsl: 0,
        emails: [],
        social: {},
        meta: {}
      });
    }

    const hasSsl = parsed.protocol === 'https:' ? 1 : 0;
    const client = hasSsl ? https : http;
    const startTime = Date.now();

    const req = client.get(
      target,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 7000
      },
      (res) => {
        // Simple redirect handling (one-hop)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          try {
            const redirectUrl = new URL(res.headers.location, target).href;
            return auditWebsite(redirectUrl).then(resolve);
          } catch {}
        }

        if (res.statusCode && res.statusCode >= 400) {
          return resolve({
            status: `http_${res.statusCode}`,
            hasSsl,
            latencyMs: Date.now() - startTime,
            emails: [],
            social: {},
            meta: {}
          });
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          body += chunk;
          if (body.length > 600000) req.destroy(); // Limit payload
        });

        res.on('end', async () => {
          const latencyMs = Date.now() - startTime;
          const emails = new Set();
          const social = {
            instagram: null,
            facebook: null,
            linkedin: null,
            twitter: null
          };

          // Email regex discovery
          const emailMatches = body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
          for (const rawEmail of emailMatches) {
            const em = rawEmail.toLowerCase().trim();
            // Filter noise, image filenames and font files
            const isJunk = em.endsWith('.png') || em.endsWith('.jpg') || em.endsWith('.jpeg') ||
                           em.endsWith('.webp') || em.endsWith('.svg') || em.includes('sentry') ||
                           em.includes('wixpress') || em.includes('schema.org') || em.includes('example.com');
            if (!isJunk) emails.add(em);
          }

          // Social media links
          const igMatch = body.match(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._-]+)/i);
          if (igMatch && !igMatch[1].startsWith('p/') && !igMatch[1].startsWith('explore/')) {
            social.instagram = igMatch[0];
          }

          const fbMatch = body.match(/https?:\/\/(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)/i);
          if (fbMatch && !fbMatch[1].startsWith('sharer') && !fbMatch[1].startsWith('tr?')) {
            social.facebook = fbMatch[0];
          }

          const liMatch = body.match(/https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9._-]+)/i);
          if (liMatch) social.linkedin = liMatch[0];

          const twMatch = body.match(/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([a-zA-Z0-9._-]+)/i);
          if (twMatch && !twMatch[1].startsWith('intent')) social.twitter = twMatch[0];

          // Meta tags
          const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
          const descMatch = body.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
          const ogDescMatch = body.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);

          const title = titleMatch ? titleMatch[1].trim() : null;
          const description = descMatch ? descMatch[1].trim() : (ogDescMatch ? ogDescMatch[1].trim() : null);

          // DNS MX check on domain
          const domain = parsed.hostname.replace(/^www\./, '');
          const mxResult = await verifyDomainMx(domain);

          resolve({
            status: 'healthy',
            hasSsl,
            latencyMs,
            hasMx: mxResult.hasMx ? 1 : 0,
            mxRecords: mxResult.records,
            emails: Array.from(emails),
            social,
            meta: {
              title,
              description,
              hasTitle: Boolean(title),
              hasDescription: Boolean(description)
            }
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        status: 'unresponsive',
        error: err.message,
        hasSsl,
        emails: [],
        social: {},
        meta: {}
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 'timeout',
        hasSsl,
        emails: [],
        social: {},
        meta: {}
      });
    });
  });
}

module.exports = {
  auditWebsite,
  verifyDomainMx
};
