require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const { db, logActivity } = require('./db');
const { discoverLeads } = require('./adapters/local-engine-adapter');
const apifyAdapter = require('./adapters/apify-adapter');
const pagespeedAdapter = require('./adapters/pagespeed-adapter');
const { auditWebsite } = require('./services/website-auditor');
const { evaluateProspect, computeDedupHash } = require('./services/intelligence-scorer');
const { generateOutreachSuite } = require('./services/outreach-generator');
const emailSender = require('./services/email-sender');
const authService = require('./services/auth');

const app = express();
const PORT = process.env.PORT || 3500;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// -------------------------------------------------------------
// 0. AUTHENTICATION & SECURITY MIDDLEWARE
// -------------------------------------------------------------
// All /api endpoints require master password auth (except login & verify)
app.use('/api', authService.middleware());

// Login with Master Password
app.post('/api/auth/login', (req, res) => {
  try {
    const { password } = req.body || {};
    const result = authService.login(password);
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify Session Token
app.get('/api/auth/verify', (req, res) => {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.query && req.query.auth_token) {
    token = req.query.auth_token;
  }

  if (authService.validateToken(token)) {
    return res.json({ valid: true, authenticated: true });
  }
  return res.status(401).json({ valid: false, authenticated: false });
});

// Change Master Password
app.post('/api/auth/change-password', (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const stored = authService.getAdminPassword();
    if (currentPassword !== stored) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters long' });
    }
    authService.setAdminPassword(newPassword);
    res.json({ success: true, message: 'Master password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// DATA PERSISTENCE & INSTANT SNAPSHOT BACKUPS
// -------------------------------------------------------------
app.get('/api/backup/database', async (req, res) => {
  try {
    const backupsDir = path.join(__dirname, '..', 'data', 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupsDir, `lucidmediax_prospects_backup_${timestamp}.db`);
    await db.backup(backupFile);
    logActivity('database', `Snapshot backup generated: ${path.basename(backupFile)}`, 'info');

    res.download(backupFile, `lucidmediax_prospects_backup_${timestamp}.db`);
  } catch (err) {
    res.status(500).json({ error: 'Database backup failed: ' + err.message });
  }
});

// -------------------------------------------------------------
// 1. DASHBOARD & PIPELINE KPIS
// -------------------------------------------------------------
app.get('/api/stats', (req, res) => {
  try {
    const totalDiscovered = db.prepare('SELECT COUNT(*) as count FROM prospects WHERE is_demo = 0').get().count;
    const qualifiedCount = db.prepare('SELECT COUNT(*) as count FROM prospects WHERE opportunity_score >= 70 AND is_demo = 0').get().count;
    const dubaiCount = db.prepare("SELECT COUNT(*) as count FROM prospects WHERE country = 'UAE' AND is_demo = 0").get().count;
    const indiaCount = db.prepare("SELECT COUNT(*) as count FROM prospects WHERE country = 'India' AND is_demo = 0").get().count;
    const verifiedContacts = db.prepare("SELECT COUNT(*) as count FROM prospects WHERE (email IS NOT NULL AND email != '') OR (phone IS NOT NULL AND phone != '')").get().count;
    const readyToApproach = db.prepare("SELECT COUNT(*) as count FROM prospects WHERE status = 'Ready to Approach' AND is_demo = 0").get().count;
    const meetingsScheduled = db.prepare("SELECT COUNT(*) as count FROM prospects WHERE status = 'Meeting Scheduled' AND is_demo = 0").get().count;
    const clientsWon = db.prepare("SELECT COUNT(*) as count FROM prospects WHERE status = 'Won' AND is_demo = 0").get().count;

    // Pipeline Stage distribution
    const pipelineStages = db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM prospects 
      WHERE is_demo = 0 
      GROUP BY status
    `).all();

    // Industry distribution
    const industryStats = db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM prospects 
      WHERE is_demo = 0 
      GROUP BY category 
      ORDER BY count DESC 
      LIMIT 6
    `).all();

    const recentLogs = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 8').all();

    res.json({
      totalDiscovered,
      qualifiedCount,
      dubaiCount,
      indiaCount,
      verifiedContacts,
      readyToApproach,
      meetingsScheduled,
      clientsWon,
      pipelineStages,
      industryStats,
      recentLogs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. LEAD DISCOVERY ENGINE
// -------------------------------------------------------------
app.post('/api/discover', async (req, res) => {
  try {
    const { country, city, area, industry, keywords, radius, source = 'local' } = req.body;

    if (!country || !city) {
      return res.status(400).json({ error: 'Country and City are required' });
    }

    logActivity('discovery', `Initiating discovery: ${industry || keywords} in ${area ? area + ', ' : ''}${city} (${country})`, 'info');

    // Run discovery asynchronously through adapter
    discoverLeads({
      country,
      city,
      area,
      industry: industry || 'Business',
      keywords,
      radius: parseInt(radius, 10) || 5000
    }).then(result => {
      logActivity('discovery', `Discovery completed: Found ${result.count || 0} leads`, result.success ? 'success' : 'warning');
    });

    res.json({
      success: true,
      message: `Discovery job started in ${area ? area + ', ' : ''}${city}. Results will stream into CRM.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 3. PROSPECT MANAGEMENT (CRM)
// -------------------------------------------------------------
app.get('/api/prospects', (req, res) => {
  try {
    const {
      search,
      country,
      city,
      status,
      priority,
      hasWebsite,
      hasEmail,
      hasPhone,
      limit = 50,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM prospects WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (business_name LIKE ? OR category LIKE ? OR address LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (country) {
      query += ' AND country = ?';
      params.push(country);
    }

    if (city) {
      query += ' AND city LIKE ?';
      params.push(`%${city}%`);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (priority) {
      query += ' AND priority_tier = ?';
      params.push(priority);
    }

    if (hasWebsite === 'true') {
      query += " AND website IS NOT NULL AND website != ''";
    }

    if (hasEmail === 'true') {
      query += " AND email IS NOT NULL AND email != ''";
    }

    if (hasPhone === 'true') {
      query += " AND phone IS NOT NULL AND phone != ''";
    }

    const countSql = query.replace('SELECT * FROM prospects', 'SELECT COUNT(*) as total FROM prospects');
    const total = db.prepare(countSql).get(...params).total;

    query += ' ORDER BY opportunity_score DESC, review_count DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const prospects = db.prepare(query).all(...params);

    res.json({ total, prospects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single prospect details with generated outreach, notes, and outreach history
app.get('/api/prospects/:id', (req, res) => {
  try {
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

    const notes = db.prepare('SELECT * FROM prospect_notes WHERE prospect_id = ? ORDER BY created_at DESC').all(prospect.id);
    const outreachHistory = db.prepare('SELECT * FROM outreach_logs WHERE prospect_id = ? ORDER BY sent_at DESC').all(prospect.id);
    const outreach = generateOutreachSuite(prospect);

    res.json({ prospect, notes, outreach, outreachHistory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update prospect status (CRM Kanban / Stage change)
app.patch('/api/prospects/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE prospects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, req.params.id);

    logActivity('crm', `Updated prospect stage to "${status}"`, 'info', { id: req.params.id });
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update prospect contact details or notes
app.patch('/api/prospects/:id', (req, res) => {
  try {
    const { business_name, email, phone, website, decision_maker_name, decision_maker_title } = req.body;
    db.prepare(`
      UPDATE prospects SET
        business_name = COALESCE(?, business_name),
        email = COALESCE(?, email),
        phone = COALESCE(?, phone),
        website = COALESCE(?, website),
        decision_maker_name = COALESCE(?, decision_maker_name),
        decision_maker_title = COALESCE(?, decision_maker_title),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(business_name, email, phone, website, decision_maker_name, decision_maker_title, req.params.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Note
app.post('/api/prospects/:id/notes', (req, res) => {
  try {
    const { note, author = 'Ashesh Thakur' } = req.body;
    if (!note) return res.status(400).json({ error: 'Note content is required' });

    db.prepare('INSERT INTO prospect_notes (prospect_id, author, note) VALUES (?, ?, ?)')
      .run(req.params.id, author, note);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. DEEP AUDIT & ENRICHMENT
// -------------------------------------------------------------
app.post('/api/prospects/:id/audit', async (req, res) => {
  try {
    const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

    if (!prospect.website) {
      return res.status(400).json({ error: 'Prospect has no recorded website to audit' });
    }

    logActivity('auditor', `Starting live web audit on ${prospect.business_name} (${prospect.website})`, 'info');
    const auditRes = await auditWebsite(prospect.website);

    const email = (auditRes.emails && auditRes.emails.length > 0) ? auditRes.emails[0] : prospect.email;
    const emailStatus = email ? (auditRes.hasMx ? 'dns_verified' : 'discovered') : prospect.email_status;

    // Recalculate Opportunity & Quality Score
    const updatedProspectState = {
      ...prospect,
      email,
      instagram_url: auditRes.social.instagram || prospect.instagram_url,
      facebook_url: auditRes.social.facebook || prospect.facebook_url,
      linkedin_url: auditRes.social.linkedin || prospect.linkedin_url,
      twitter_url: auditRes.social.twitter || prospect.twitter_url
    };

    const evalRes = evaluateProspect(updatedProspectState, {
      websiteHasSsl: auditRes.hasSsl,
      hasMetaDescription: auditRes.meta && auditRes.meta.hasDescription,
      websiteSpeedScore: auditRes.latencyMs < 1500 ? 85 : 45
    });

    db.prepare(`
      UPDATE prospects SET
        website_status = ?,
        website_has_ssl = ?,
        website_title = ?,
        website_description = ?,
        email = COALESCE(?, email),
        email_status = ?,
        email_source = CASE WHEN ? IS NOT NULL THEN 'Direct Website HTML' ELSE email_source END,
        instagram_url = COALESCE(?, instagram_url),
        facebook_url = COALESCE(?, facebook_url),
        linkedin_url = COALESCE(?, linkedin_url),
        twitter_url = COALESCE(?, twitter_url),
        identified_problems = ?,
        recommended_services = ?,
        executive_opportunity_brief = ?,
        opportunity_score = ?,
        confidence_score = ?,
        priority_tier = ?,
        last_audit_timestamp = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      auditRes.status,
      auditRes.hasSsl,
      auditRes.meta.title,
      auditRes.meta.description,
      email,
      emailStatus,
      email,
      auditRes.social.instagram,
      auditRes.social.facebook,
      auditRes.social.linkedin,
      auditRes.social.twitter,
      JSON.stringify(evalRes.identifiedProblems),
      JSON.stringify(evalRes.recommendedServices),
      evalRes.executiveBrief,
      evalRes.opportunityScore,
      evalRes.confidenceScore,
      evalRes.priorityTier,
      prospect.id
    );

    logActivity('auditor', `Completed audit on ${prospect.business_name}. Opportunity Score: ${evalRes.opportunityScore}`, 'success');
    res.json({ success: true, audit: auditRes, evaluation: evalRes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. DATA IMPORT (PRE-EXISTING VERIFIED LEADS & DUBAI DATA)
// -------------------------------------------------------------
app.post('/api/import/existing', (req, res) => {
  try {
    const seedsDir = path.join(__dirname, '..', 'data', 'seeds');
    const candidates = [
      {
        path: fs.existsSync(path.join(seedsDir, 'dentists_patna.json'))
          ? path.join(seedsDir, 'dentists_patna.json')
          : '/Users/asheshthakur/Documents/Google Scrapper/dentists_patna.json',
        country: 'India',
        city: 'Patna'
      },
      {
        path: fs.existsSync(path.join(seedsDir, 'dentists_ranchi_under_top10.json'))
          ? path.join(seedsDir, 'dentists_ranchi_under_top10.json')
          : '/Users/asheshthakur/Documents/Google Scrapper/dentists_ranchi_under_top10.json',
        country: 'India',
        city: 'Ranchi'
      },
      {
        path: fs.existsSync(path.join(seedsDir, 'dermats_bokaro.json'))
          ? path.join(seedsDir, 'dermats_bokaro.json')
          : '/Users/asheshthakur/Documents/Google Scrapper/dermats_bokaro.json',
        country: 'India',
        city: 'Bokaro'
      },
      {
        path: fs.existsSync(path.join(seedsDir, 'dubai_business_bay.json'))
          ? path.join(seedsDir, 'dubai_business_bay.json')
          : '/tmp/dubai_test.json',
        country: 'UAE',
        city: 'Dubai',
        area: 'Business Bay'
      }
    ];

    let totalImported = 0;
    const insertStmt = db.prepare(`
      INSERT INTO prospects (
        id, campaign_id, is_demo, business_name, category, categories,
        country, city, area, address, latitude, longitude, timezone,
        phone, phone_clean, website, email, email_status, email_source,
        instagram_url, facebook_url, linkedin_url, twitter_url, google_maps_url,
        place_id, rating, review_count, opening_hours, identified_problems,
        recommended_services, executive_opportunity_brief, opportunity_score,
        confidence_score, priority_tier, discovery_source, dedup_hash, status
      ) VALUES (
        @id, NULL, 0, @business_name, @category, @categories,
        @country, @city, @area, @address, @latitude, @longitude, @timezone,
        @phone, @phone_clean, @website, @email, @email_status, @email_source,
        @instagram_url, @facebook_url, @linkedin_url, @twitter_url, @google_maps_url,
        @place_id, @rating, @review_count, @opening_hours, @identified_problems,
        @recommended_services, @executive_opportunity_brief, @opportunity_score,
        @confidence_score, @priority_tier, 'Local Engine', @dedup_hash, 'New Lead'
      )
      ON CONFLICT(dedup_hash) DO NOTHING
    `);

    for (const itemCfg of candidates) {
      if (fs.existsSync(itemCfg.path)) {
        const raw = JSON.parse(fs.readFileSync(itemCfg.path, 'utf8'));
        if (Array.isArray(raw)) {
          for (const item of raw) {
            const leadObj = {
              id: `prospect_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              business_name: item.business_name || item.title || item.name || 'Untitled',
              category: item.category || (item.categories && item.categories[0]) || 'Business',
              categories: JSON.stringify(item.categories || []),
              country: itemCfg.country,
              city: itemCfg.city,
              area: itemCfg.area || '',
              address: item.full_address || item.address || '',
              latitude: Number(item.latitude) || null,
              longitude: Number(item.longitude || item.longtitude) || null,
              timezone: itemCfg.country === 'UAE' ? 'Asia/Dubai' : 'Asia/Kolkata',
              phone: item.phone || '',
              phone_clean: (item.phone || '').replace(/[^0-9+]/g, ''),
              website: item.website || item.web_site || '',
              email: item.email || (item.emails && item.emails[0]) || null,
              email_status: (item.email || (item.emails && item.emails[0])) ? 'discovered' : 'unverified',
              email_source: item.email ? 'Pre-existing Qualified Lead' : null,
              instagram_url: item.instagram || null,
              facebook_url: item.facebook || null,
              linkedin_url: item.linkedin || null,
              twitter_url: item.twitter || null,
              google_maps_url: item.google_maps_url || item.link || '',
              place_id: item.place_id || '',
              rating: Number(item.rating || item.review_rating) || 0,
              review_count: Number(item.review_count) || 0,
              opening_hours: JSON.stringify(item.opening_hours || item.open_hours || {})
            };

            leadObj.dedup_hash = computeDedupHash(leadObj);
            const evalRes = evaluateProspect(leadObj, {});
            leadObj.opportunity_score = evalRes.opportunityScore;
            leadObj.confidence_score = evalRes.confidenceScore;
            leadObj.priority_tier = evalRes.priorityTier;
            leadObj.identified_problems = JSON.stringify(evalRes.identifiedProblems);
            leadObj.recommended_services = JSON.stringify(evalRes.recommendedServices);
            leadObj.executive_opportunity_brief = evalRes.executiveBrief;

            try {
              const info = insertStmt.run(leadObj);
              if (info.changes > 0) totalImported++;
            } catch {}
          }
        }
      }
    }

    logActivity('importer', `Imported and deduplicated ${totalImported} real prospects across Dubai & India`, 'success');
    res.json({ success: true, count: totalImported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. EXPORT CENTER
// -------------------------------------------------------------
app.get('/api/export/csv', (req, res) => {
  try {
    const { country } = req.query;
    let sql = 'SELECT * FROM prospects WHERE is_demo = 0';
    const params = [];
    if (country) {
      sql += ' AND country = ?';
      params.push(country);
    }
    sql += ' ORDER BY opportunity_score DESC';

    const prospects = db.prepare(sql).all(...params);
    const rows = prospects.map(p => ({
      'Opportunity Score': p.opportunity_score,
      'Priority Tier': p.priority_tier,
      'Business Name': p.business_name,
      'Market': p.country,
      'City': p.city,
      'Area': p.area,
      'Category': p.category,
      'Direct Phone': p.phone,
      'Website': p.website,
      'Verified Email': p.email,
      'Email Status': p.email_status,
      'Star Rating': p.rating,
      'Reviews Count': p.review_count,
      'Recommended Services': p.recommended_services,
      'Identified Problems': p.identified_problems,
      'CRM Status': p.status,
      'Discovered At': p.discovery_timestamp
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);

    res.header('Content-Type', 'text/csv');
    res.attachment(`LucidMediax_Prospects_${country || 'All'}_${new Date().toISOString().slice(0, 10)}.csv`);
    return res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 7. OUTREACH ENGINE & COMMUNICATION TRACKER
// -------------------------------------------------------------

// Direct Email Dispatch
app.post('/api/outreach/send-email', async (req, res) => {
  try {
    const { prospectId, toEmail, subject, body } = req.body;
    if (!prospectId || !subject || !body) {
      return res.status(400).json({ error: 'prospectId, subject, and body are required' });
    }

    const result = await emailSender.sendSingleEmail({
      prospectId,
      toEmail,
      subject,
      body,
      channel: 'email'
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Count eligible prospects for batch automation
app.get('/api/outreach/eligible-count', (req, res) => {
  try {
    const { country, minScore = 50 } = req.query;
    let sql = `
      SELECT COUNT(*) as count FROM prospects 
      WHERE email IS NOT NULL 
        AND email != '' 
        AND is_demo = 0 
        AND is_suppressed = 0
        AND status NOT IN ('Contacted', 'Won', 'Lost', 'Meeting Scheduled')
    `;
    const params = [];

    if (country && country !== 'all') {
      sql += ' AND country = ?';
      params.push(country);
    }
    if (minScore) {
      sql += ' AND opportunity_score >= ?';
      params.push(parseInt(minScore, 10));
    }

    const row = db.prepare(sql).get(...params);
    res.json({ count: row.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Automated Batch Email Dispatch
app.post('/api/outreach/batch-send', async (req, res) => {
  try {
    const { country, minScore = 70, limit = 10, delaySeconds = 2 } = req.body;

    const result = await emailSender.sendBatchEmails({
      filter: { country, minScore },
      limit: parseInt(limit, 10),
      delayMs: parseInt(delaySeconds, 10) * 1000
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Log Manual Interaction (WhatsApp, LinkedIn, Instagram DM, Phone)
app.post('/api/outreach/log-interaction', (req, res) => {
  try {
    const { prospectId, channel, recipientContact, subject, message, situation, followUpDays } = req.body;
    if (!prospectId || !channel || !message) {
      return res.status(400).json({ error: 'prospectId, channel, and message are required' });
    }

    const result = emailSender.logInteraction({
      prospectId,
      channel,
      recipientContact,
      subject,
      message,
      situation: situation || 'Awaiting Reply',
      followUpDays: followUpDays || 3
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Outreach Tracker Feed with Metrics and Filters
app.get('/api/outreach/tracker', (req, res) => {
  try {
    const { channel, situation, market, search, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM outreach_logs WHERE 1=1';
    const params = [];

    if (channel && channel !== 'all') {
      query += ' AND channel = ?';
      params.push(channel);
    }

    if (situation && situation !== 'all') {
      query += ' AND situation = ?';
      params.push(situation);
    }

    if (market && market !== 'all') {
      query += ' AND country = ?';
      params.push(market);
    }

    if (search) {
      query += ' AND (prospect_name LIKE ? OR recipient_contact LIKE ? OR subject LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countSql = query.replace('SELECT * FROM outreach_logs', 'SELECT COUNT(*) as total FROM outreach_logs');
    const total = db.prepare(countSql).get(...params).total;

    query += ' ORDER BY sent_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const logs = db.prepare(query).all(...params);

    // Metrics for Outreach Tracker Cockpit
    const totalApproached = db.prepare('SELECT COUNT(DISTINCT prospect_id) as c FROM outreach_logs').get().c;
    const totalTouchpoints = db.prepare('SELECT COUNT(*) as c FROM outreach_logs').get().c;
    const emailCount = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE channel = 'email'").get().c;
    const whatsappCount = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE channel = 'whatsapp'").get().c;
    const linkedinCount = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE channel = 'linkedin'").get().c;
    
    const awaitingReply = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE situation = 'Awaiting Reply'").get().c;
    const followUpDue = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE situation = 'Follow-up Due' OR (situation = 'Awaiting Reply' AND follow_up_due <= CURRENT_TIMESTAMP)").get().c;
    const positiveReplies = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE situation IN ('Responded - Interested', 'Meeting Scheduled', 'Proposal Sent', 'Won')").get().c;
    const meetingsCount = db.prepare("SELECT COUNT(*) as c FROM outreach_logs WHERE situation = 'Meeting Scheduled'").get().c;

    res.json({
      total,
      logs,
      metrics: {
        totalApproached,
        totalTouchpoints,
        emailCount,
        whatsappCount,
        linkedinCount,
        awaitingReply,
        followUpDue,
        positiveReplies,
        meetingsCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Situation of Outreach & Sync Prospect Status
app.patch('/api/outreach/tracker/:id/situation', (req, res) => {
  try {
    const { situation, notes } = req.body;
    if (!situation) {
      return res.status(400).json({ error: 'situation is required' });
    }

    const log = db.prepare('SELECT * FROM outreach_logs WHERE id = ?').get(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Outreach entry not found' });
    }

    db.prepare(`
      UPDATE outreach_logs SET
        situation = ?,
        notes = COALESCE(?, notes),
        last_situation_update = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(situation, notes || null, req.params.id);

    // Map situation to CRM Stage if applicable
    let mappedCrmStage = null;
    if (situation === 'Responded - Interested' || situation === 'Responded') mappedCrmStage = 'Responded';
    else if (situation === 'Meeting Scheduled') mappedCrmStage = 'Meeting Scheduled';
    else if (situation === 'Proposal Sent') mappedCrmStage = 'Proposal Sent';
    else if (situation === 'Won') mappedCrmStage = 'Won';
    else if (situation === 'Follow-up Due') mappedCrmStage = 'Follow-up Due';
    else if (situation === 'Responded - Not Interested') mappedCrmStage = 'Lost';

    if (mappedCrmStage) {
      db.prepare('UPDATE prospects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(mappedCrmStage, log.prospect_id);
    }

    logActivity('outreach_tracker', `Updated situation for ${log.prospect_name} to "${situation}"`, 'info');
    res.json({ success: true, situation, mappedCrmStage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export Outreach Log to CSV
app.get('/api/export/outreach-csv', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM outreach_logs ORDER BY sent_at DESC').all();
    const rows = logs.map(l => ({
      'Log ID': l.id,
      'Prospect ID': l.prospect_id,
      'Company Name': l.prospect_name,
      'Market': l.country,
      'City': l.city,
      'Channel / Means': l.channel.toUpperCase(),
      'Contact Info': l.recipient_contact,
      'Current Situation': l.situation,
      'Delivery Status': l.delivery_status,
      'Subject': l.subject || '',
      'Message Preview': (l.message || '').slice(0, 150),
      'Sent At': l.sent_at,
      'Follow-up Due': l.follow_up_due || '',
      'Last Update': l.last_situation_update
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);

    res.header('Content-Type', 'text/csv');
    res.attachment(`LucidMediax_Outreach_Tracker_${new Date().toISOString().slice(0, 10)}.csv`);
    return res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SMTP Settings Configuration & Testing
app.get('/api/settings/smtp', (req, res) => {
  try {
    const cfg = emailSender.getSmtpConfig();
    res.json({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      from: cfg.from,
      secure: cfg.secure,
      hasPassword: Boolean(cfg.pass),
      isConfigured: emailSender.isSmtpConfigured()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/smtp', (req, res) => {
  try {
    const { host, port, user, pass, from, secure } = req.body;
    emailSender.saveSmtpConfig({ host, port, user, pass, from, secure });
    res.json({ success: true, message: 'SMTP settings updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/smtp/test', async (req, res) => {
  try {
    const { host, port, user, pass, secure } = req.body;
    const testResult = await emailSender.testConnection({
      host,
      port: parseInt(port || '587', 10),
      user,
      pass,
      secure: Boolean(secure)
    });
    res.json(testResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 8. SETTINGS & ADAPTER HEALTH CHECKS
// -------------------------------------------------------------
app.get('/api/adapters/status', async (req, res) => {
  try {
    const apifyStatus = await apifyAdapter.testConnection();
    const pageSpeedStatus = await pagespeedAdapter.testConnection();

    res.json({
      localScraper: {
        configured: true,
        status: 'Operational (Active)',
        path: process.env.LOCAL_SCRAPER_PATH || 'google-maps-scraper/google-maps-scraper',
        message: 'High-speed local Go binary ready for zero-cost discovery.'
      },
      directWebAuditor: {
        configured: true,
        status: 'Operational (Active)',
        message: 'Built-in Node.js DNS MX and direct homepage crawler active.'
      },
      apify: apifyStatus,
      pageSpeed: pageSpeedStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 8. LOGS
// -------------------------------------------------------------
app.get('/api/logs', (req, res) => {
  try {
    const logs = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 50').all();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function autoSeedIfEmpty() {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM prospects').get();
    if (row && row.count === 0) {
      console.log('[AutoSeed] Database is empty. Ingesting baseline datasets...');
      const seedsDir = path.join(__dirname, '..', 'data', 'seeds');
      const candidates = [
        { path: path.join(seedsDir, 'dentists_patna.json'), country: 'India', city: 'Patna' },
        { path: path.join(seedsDir, 'dentists_ranchi_under_top10.json'), country: 'India', city: 'Ranchi' },
        { path: path.join(seedsDir, 'dermats_bokaro.json'), country: 'India', city: 'Bokaro' },
        { path: path.join(seedsDir, 'dubai_business_bay.json'), country: 'UAE', city: 'Dubai', area: 'Business Bay' }
      ];

      const insertStmt = db.prepare(`
        INSERT INTO prospects (
          id, campaign_id, is_demo, business_name, category, categories,
          country, city, area, address, latitude, longitude, timezone,
          phone, phone_clean, website, email, email_status, email_source,
          instagram_url, facebook_url, linkedin_url, twitter_url, google_maps_url,
          place_id, rating, review_count, opening_hours, identified_problems,
          recommended_services, executive_opportunity_brief, opportunity_score,
          confidence_score, priority_tier, discovery_source, dedup_hash, status
        ) VALUES (
          @id, NULL, 0, @business_name, @category, @categories,
          @country, @city, @area, @address, @latitude, @longitude, @timezone,
          @phone, @phone_clean, @website, @email, @email_status, @email_source,
          @instagram_url, @facebook_url, @linkedin_url, @twitter_url, @google_maps_url,
          @place_id, @rating, @review_count, @opening_hours, @identified_problems,
          @recommended_services, @executive_opportunity_brief, @opportunity_score,
          @confidence_score, @priority_tier, 'Local Engine', @dedup_hash, 'New Lead'
        )
        ON CONFLICT(dedup_hash) DO NOTHING
      `);

      let totalImported = 0;
      for (const item of candidates) {
        if (fs.existsSync(item.path)) {
          const raw = JSON.parse(fs.readFileSync(item.path, 'utf8'));
          const leads = Array.isArray(raw) ? raw : (raw.results || raw.places || []);
          for (const lead of leads) {
            const leadObj = {
              id: 'lead_' + Math.random().toString(36).substring(2, 11),
              business_name: lead.title || lead.name || 'Unnamed Business',
              category: lead.category || lead.main_category || 'Business',
              categories: JSON.stringify(lead.categories || []),
              country: item.country,
              city: item.city,
              area: item.area || '',
              address: lead.address || lead.full_address || '',
              latitude: lead.latitude || lead.lat || null,
              longitude: lead.longitude || lead.lng || null,
              timezone: item.country === 'UAE' ? 'Asia/Dubai' : 'Asia/Kolkata',
              phone: lead.phone || '',
              phone_clean: (lead.phone || '').replace(/[^0-9+]/g, ''),
              website: lead.website || lead.link || '',
              email: lead.email || '',
              email_status: lead.email ? 'verified' : 'missing',
              email_source: lead.email ? 'direct_maps' : 'none',
              instagram_url: lead.instagram || (lead.socials && lead.socials.instagram) || '',
              facebook_url: lead.facebook || (lead.socials && lead.socials.facebook) || '',
              linkedin_url: lead.linkedin || (lead.socials && lead.socials.linkedin) || '',
              twitter_url: lead.twitter || (lead.socials && lead.socials.twitter) || '',
              google_maps_url: lead.url || lead.google_maps_url || '',
              place_id: lead.place_id || '',
              rating: lead.rating || lead.total_score || 0,
              review_count: lead.reviews_count || lead.review_count || 0,
              opening_hours: JSON.stringify(lead.opening_hours || lead.hours || {}),
              dedup_hash: computeDedupHash(lead.title || lead.name, lead.phone, lead.website)
            };

            const evalRes = evaluateProspect(leadObj);
            leadObj.opportunity_score = evalRes.opportunityScore;
            leadObj.confidence_score = evalRes.confidenceScore;
            leadObj.priority_tier = evalRes.priorityTier;
            leadObj.identified_problems = JSON.stringify(evalRes.identifiedProblems);
            leadObj.recommended_services = JSON.stringify(evalRes.recommendedServices);
            leadObj.executive_opportunity_brief = evalRes.executiveBrief;

            try {
              const info = insertStmt.run(leadObj);
              if (info.changes > 0) totalImported++;
            } catch {}
          }
        }
      }
      console.log(`[AutoSeed] Ingested ${totalImported} baseline prospects.`);
    }
  } catch (err) {
    console.warn('[AutoSeed] Notice:', err.message);
  }
}

app.listen(PORT, () => {
  logActivity('system', `LucidMediax Growth Intelligence running on http://localhost:${PORT}`, 'info');
  console.log(`LucidMediax Client Acquisition Engine running at http://localhost:${PORT}`);

  // Auto-seed if database is brand new
  autoSeedIfEmpty();

  // Automated snapshot backup on server launch
  try {
    const backupsDir = path.join(__dirname, '..', 'data', 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const today = new Date().toISOString().slice(0, 10);
    const dailyBackupFile = path.join(backupsDir, `lucidmediax_prospects_daily_${today}.db`);
    if (!fs.existsSync(dailyBackupFile)) {
      db.backup(dailyBackupFile)
        .then(() => console.log(`[Backup] Daily persistence snapshot created: ${dailyBackupFile}`))
        .catch(err => console.error('[Backup] Snapshot failed:', err.message));
    }
  } catch (err) {
    console.warn('[Backup] Notice:', err.message);
  }
});
