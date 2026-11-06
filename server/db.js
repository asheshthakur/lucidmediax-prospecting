const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'lucidmediax_prospects.db');
const db = new Database(dbPath);

// Enable WAL for performance and concurrent read/write
db.pragma('journal_mode = WAL');

// Execute Database Schema
db.exec(`
  -- Campaigns (Segmented by Market: Dubai vs India)
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    market TEXT NOT NULL, -- 'Dubai' or 'India'
    city TEXT NOT NULL,
    area TEXT,
    industry TEXT NOT NULL,
    keywords TEXT,
    status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed'
    target_lead_count INTEGER DEFAULT 50,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Discovered Business Prospects & CRM
  CREATE TABLE IF NOT EXISTS prospects (
    id TEXT PRIMARY KEY,
    campaign_id TEXT,
    is_demo INTEGER DEFAULT 0, -- 0 = Real Live Lead, 1 = Demo Lead
    
    -- Business Profile
    business_name TEXT NOT NULL,
    category TEXT,
    categories TEXT, -- JSON Array
    country TEXT NOT NULL, -- 'UAE' or 'India'
    city TEXT NOT NULL,
    area TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    timezone TEXT,
    
    -- Contact Information
    phone TEXT,
    phone_clean TEXT,
    website TEXT,
    email TEXT,
    email_status TEXT DEFAULT 'unverified', -- 'unverified', 'discovered', 'dns_verified', 'bounced'
    email_source TEXT,
    
    -- Social Media URLs
    instagram_url TEXT,
    facebook_url TEXT,
    linkedin_url TEXT,
    twitter_url TEXT,
    google_maps_url TEXT,
    place_id TEXT,
    
    -- Decision Maker Information
    decision_maker_name TEXT,
    decision_maker_title TEXT,
    decision_maker_linkedin TEXT,
    
    -- Ratings & Operating Metrics
    rating REAL DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    opening_hours TEXT, -- JSON
    
    -- Digital Audit & Assessment
    website_status TEXT DEFAULT 'unknown', -- 'healthy', 'slow', 'no_ssl', 'missing', 'unresponsive'
    website_has_ssl INTEGER DEFAULT 0,
    website_mobile_friendly INTEGER DEFAULT 1,
    website_title TEXT,
    website_description TEXT,
    website_speed_score INTEGER,
    
    social_audit TEXT, -- JSON: { instagram_active, post_frequency_status, branding_consistent }
    seo_audit TEXT, -- JSON: { missing_meta, weak_local_seo, review_velocity_low }
    identified_problems TEXT, -- JSON Array of specific issues e.g. ["Inactive Instagram", "No Meta Description"]
    recommended_services TEXT, -- JSON Array of LucidMediax services e.g. ["Social Media Management", "Local SEO"]
    executive_opportunity_brief TEXT, -- Short 2-sentence conversational briefing
    
    -- Intelligent Scoring
    opportunity_score INTEGER DEFAULT 0, -- 0-100 commercial opportunity for LucidMediax
    confidence_score INTEGER DEFAULT 0, -- 0-100 data completeness and verification
    priority_tier TEXT DEFAULT 'Medium', -- 'Excellent', 'High', 'Potential', 'Low', 'Excluded'
    score_breakdown TEXT, -- JSON explanation of scoring factors
    
    -- Source Attribution
    discovery_source TEXT NOT NULL, -- 'Local Engine', 'Apify G-Maps', 'Manual CSV Import'
    discovery_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_audit_timestamp DATETIME,
    
    -- Deduplication Fingerprint
    dedup_hash TEXT UNIQUE,
    
    -- CRM Pipeline State
    status TEXT DEFAULT 'New Lead', 
    -- 'New Lead', 'Researched', 'Qualified', 'Contact Details Verified', 'Ready to Approach', 
    -- 'Contacted', 'Follow-up Due', 'Responded', 'Meeting Scheduled', 'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'Not Interested'
    
    assigned_to TEXT,
    last_contacted_at DATETIME,
    follow_up_due_at DATETIME,
    is_suppressed INTEGER DEFAULT 0, -- 1 = Do Not Contact (opt-out)
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
  );

  -- CRM Notes & Outreach History
  CREATE TABLE IF NOT EXISTS prospect_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_id TEXT NOT NULL,
    author TEXT DEFAULT 'Growth Team',
    note TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
  );

  -- Outreach Drafts & Generation History
  CREATE TABLE IF NOT EXISTS outreach_drafts (
    id TEXT PRIMARY KEY,
    prospect_id TEXT NOT NULL,
    channel TEXT NOT NULL, -- 'email', 'whatsapp', 'instagram', 'linkedin', 'follow_up_3d', 'follow_up_7d'
    language TEXT DEFAULT 'en_pro', -- 'en_pro', 'en_casual', 'en_in', 'hinglish', 'ar_dubai'
    subject_line TEXT,
    message_body TEXT NOT NULL,
    status TEXT DEFAULT 'draft', -- 'draft', 'reviewed', 'sent', 'suppressed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
  );

  -- Suppression / Do-Not-Contact Registry
  CREATE TABLE IF NOT EXISTS suppression_list (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT,
    email TEXT,
    phone TEXT,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Activity & Error Audit Logs
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT DEFAULT 'info', -- 'info', 'success', 'warning', 'error'
    module TEXT,
    message TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Outreach & Communications Tracker
  CREATE TABLE IF NOT EXISTS outreach_logs (
    id TEXT PRIMARY KEY,
    prospect_id TEXT NOT NULL,
    prospect_name TEXT NOT NULL,
    country TEXT,
    city TEXT,
    channel TEXT NOT NULL, -- 'email', 'whatsapp', 'instagram', 'linkedin', 'phone', 'follow_up_3d', 'follow_up_7d'
    recipient_contact TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    situation TEXT DEFAULT 'Awaiting Reply',
    -- 'Awaiting Reply', 'Follow-up Due', 'Responded - Interested', 'Responded - Not Interested', 'Meeting Scheduled', 'Proposal Sent', 'Bounced', 'Opted-Out'
    delivery_status TEXT DEFAULT 'sent', -- 'sent', 'simulated', 'failed'
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    follow_up_due DATETIME,
    last_situation_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    FOREIGN KEY(prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
  );

  -- System & SMTP Settings
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function logActivity(module, message, level = 'info', details = null) {
  try {
    const stmt = db.prepare('INSERT INTO activity_logs (module, message, level, details) VALUES (?, ?, ?, ?)');
    stmt.run(module, message, level, details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null);
  } catch (err) {
    console.error('Database logging error:', err);
  }
}

module.exports = {
  db,
  logActivity
};
