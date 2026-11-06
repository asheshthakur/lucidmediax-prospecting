const nodemailer = require('nodemailer');
const { db, logActivity } = require('../db');
const { generateOutreachSuite } = require('./outreach-generator');

class EmailSenderService {
  /**
   * Retrieves active SMTP configuration from SQLite settings or environment variables
   */
  getSmtpConfig() {
    try {
      const row = db.prepare("SELECT value FROM system_settings WHERE key = 'smtp_config'").get();
      if (row && row.value) {
        return JSON.parse(row.value);
      }
    } catch (e) {
      // ignore
    }

    // Fallback to environment variables
    return {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'Ashesh Thakur | LucidMediax <contact@lucidmediax.com>',
      secure: process.env.SMTP_SECURE === 'true'
    };
  }

  saveSmtpConfig(config) {
    const jsonStr = JSON.stringify({
      host: config.host || '',
      port: parseInt(config.port || '587', 10),
      user: config.user || '',
      pass: config.pass || '',
      from: config.from || 'Ashesh Thakur | LucidMediax <contact@lucidmediax.com>',
      secure: Boolean(config.secure)
    });

    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at) 
      VALUES ('smtp_config', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(jsonStr);

    logActivity('settings', `SMTP configuration updated: host=${config.host}, user=${config.user}`, 'info');
    return true;
  }

  isSmtpConfigured() {
    const cfg = this.getSmtpConfig();
    return Boolean(cfg.host && cfg.user && cfg.pass);
  }

  /**
   * Tests SMTP connectivity
   */
  async testConnection(customConfig = null) {
    const cfg = customConfig || this.getSmtpConfig();
    if (!cfg.host || !cfg.user || !cfg.pass) {
      return {
        configured: false,
        status: 'Unconfigured',
        message: 'SMTP host, username, or password is not set. Outgoing emails will use Simulated/Safe Tracking Mode until configured.'
      };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: {
          user: cfg.user,
          pass: cfg.pass
        },
        connectionTimeout: 8000
      });

      await transporter.verify();
      return {
        configured: true,
        status: 'Connected',
        message: `Successfully authenticated with SMTP server (${cfg.host}:${cfg.port})`
      };
    } catch (err) {
      return {
        configured: false,
        status: 'Connection Failed',
        message: err.message
      };
    }
  }

  /**
   * Helper to check if recipient is suppressed/opted-out
   */
  isSuppressed(email) {
    if (!email) return false;
    const clean = email.toLowerCase().trim();
    const row = db.prepare('SELECT id FROM suppression_list WHERE email = ?').get(clean);
    return Boolean(row);
  }

  /**
   * Send a direct single personalized email and log interaction in Outreach Tracker
   */
  async sendSingleEmail({ prospectId, toEmail, subject, body, channel = 'email' }) {
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    if (!prospect) {
      throw new Error(`Prospect with id ${prospectId} not found`);
    }

    const recipient = (toEmail || prospect.email || '').trim();
    if (!recipient || !recipient.includes('@')) {
      throw new Error(`Invalid recipient email address for ${prospect.business_name}`);
    }

    if (this.isSuppressed(recipient)) {
      throw new Error(`Recipient ${recipient} is on the suppression/opt-out list.`);
    }

    const cfg = this.getSmtpConfig();
    const isConfigured = Boolean(cfg.host && cfg.user && cfg.pass);
    let deliveryStatus = 'simulated';
    let errorMessage = null;

    if (isConfigured) {
      try {
        const transporter = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: {
            user: cfg.user,
            pass: cfg.pass
          },
          connectionTimeout: 10000
        });

        await transporter.sendMail({
          from: cfg.from || 'LucidMediax Growth Team <contact@lucidmediax.com>',
          to: recipient,
          subject: subject,
          text: body
        });
        deliveryStatus = 'sent';
      } catch (err) {
        logActivity('email_sender', `SMTP send error for ${recipient}: ${err.message}`, 'error');
        deliveryStatus = 'failed';
        errorMessage = err.message;
        throw new Error(`Failed to send email via SMTP: ${err.message}`);
      }
    } else {
      // Simulated Delivery mode
      deliveryStatus = 'simulated';
      logActivity(
        'email_sender',
        `Simulated email sent to ${prospect.business_name} (${recipient}) - SMTP not yet configured`,
        'info'
      );
    }

    // Calculate follow-up due date (+3 days from now)
    const followUpDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const logId = `outreach_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // 1. Insert into Outreach Tracker table
    db.prepare(`
      INSERT INTO outreach_logs (
        id, prospect_id, prospect_name, country, city, channel,
        recipient_contact, subject, message, situation, delivery_status,
        sent_at, follow_up_due, last_situation_update
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 'Awaiting Reply', ?,
        CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP
      )
    `).run(
      logId,
      prospect.id,
      prospect.business_name,
      prospect.country,
      prospect.city,
      channel,
      recipient,
      subject,
      body,
      deliveryStatus,
      followUpDate
    );

    // 2. Update CRM prospect stage to 'Contacted' and record timestamps
    db.prepare(`
      UPDATE prospects SET
        status = 'Contacted',
        last_contacted_at = CURRENT_TIMESTAMP,
        follow_up_due_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(followUpDate, prospect.id);

    return {
      success: true,
      logId,
      deliveryStatus,
      isSimulated: !isConfigured,
      recipient,
      situation: 'Awaiting Reply',
      followUpDue: followUpDate,
      message: isConfigured
        ? `Email successfully sent to ${recipient} via SMTP.`
        : `Email logged and marked Contacted in Outreach Tracker (Simulator Mode - configure SMTP in Settings for live sending).`
    };
  }

  /**
   * Log manual multi-channel interaction (WhatsApp, LinkedIn, Instagram DM, Phone Call)
   */
  logInteraction({ prospectId, channel, recipientContact, subject, message, situation = 'Awaiting Reply', followUpDays = 3 }) {
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(prospectId);
    if (!prospect) {
      throw new Error(`Prospect not found`);
    }

    const logId = `outreach_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const followUpDate = new Date(Date.now() + followUpDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    db.prepare(`
      INSERT INTO outreach_logs (
        id, prospect_id, prospect_name, country, city, channel,
        recipient_contact, subject, message, situation, delivery_status,
        sent_at, follow_up_due, last_situation_update
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 'sent',
        CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP
      )
    `).run(
      logId,
      prospect.id,
      prospect.business_name,
      prospect.country,
      prospect.city,
      channel,
      recipientContact || prospect.phone || prospect.email || prospect.business_name,
      subject || `${channel.toUpperCase()} Outreach`,
      message,
      situation,
      followUpDate
    );

    db.prepare(`
      UPDATE prospects SET
        status = 'Contacted',
        last_contacted_at = CURRENT_TIMESTAMP,
        follow_up_due_at = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(followUpDate, prospect.id);

    logActivity('outreach_tracker', `Logged ${channel} touchpoint for ${prospect.business_name} (${situation})`, 'success');

    return {
      success: true,
      logId,
      situation,
      followUpDue: followUpDate
    };
  }

  /**
   * Automated batch email dispatch to prospects with emails
   */
  async sendBatchEmails({ filter = {}, limit = 10, delayMs = 2000 }) {
    let sql = `
      SELECT * FROM prospects 
      WHERE email IS NOT NULL 
        AND email != '' 
        AND is_demo = 0 
        AND is_suppressed = 0
        AND status NOT IN ('Contacted', 'Won', 'Lost', 'Meeting Scheduled')
    `;
    const params = [];

    if (filter.country && filter.country !== 'all') {
      sql += ' AND country = ?';
      params.push(filter.country);
    }
    if (filter.minScore) {
      sql += ' AND opportunity_score >= ?';
      params.push(parseInt(filter.minScore, 10));
    }

    sql += ' ORDER BY opportunity_score DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const eligible = db.prepare(sql).all(...params);
    const results = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const p of eligible) {
      try {
        const outreach = generateOutreachSuite(p);
        const coldEmail = outreach.coldEmail;
        const res = await this.sendSingleEmail({
          prospectId: p.id,
          toEmail: p.email,
          subject: coldEmail.subject,
          body: coldEmail.body,
          channel: 'email'
        });
        results.push({ prospectId: p.id, name: p.business_name, email: p.email, status: 'success', res });
        sentCount++;
      } catch (err) {
        results.push({ prospectId: p.id, name: p.business_name, email: p.email, status: 'error', error: err.message });
        failedCount++;
      }

      // Safe delay between outbound requests to prevent rate limiting
      if (delayMs > 0 && eligible.length > 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    logActivity('batch_automation', `Batch email automation finished: ${sentCount} sent, ${failedCount} failed`, 'info');

    return {
      totalAttempted: eligible.length,
      sentCount,
      failedCount,
      results
    };
  }
}

module.exports = new EmailSenderService();
