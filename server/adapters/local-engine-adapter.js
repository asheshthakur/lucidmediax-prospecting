const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { db, logActivity } = require('../db');
const { computeDedupHash, evaluateProspect } = require('../services/intelligence-scorer');
const { auditWebsite } = require('../services/website-auditor');

const SCRAPER_BIN = process.env.LOCAL_SCRAPER_PATH || '/Users/asheshthakur/Documents/Google Scrapper/google-maps-scraper/google-maps-scraper';

/**
 * OpenStreetMap Nominatim geocoding with user-agent compliance
 */
async function geocodeLocation(locationQuery) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(locationQuery)}`;
    https.get(
      url,
      {
        headers: { 'User-Agent': 'LucidMediaxClientEngine/1.0 (local prospecting)' },
        timeout: 8000
      },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data && data.length > 0) {
              return resolve({
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                displayName: data[0].display_name
              });
            }
            resolve(null);
          } catch {
            resolve(null);
          }
        });
      }
    ).on('error', () => resolve(null));
  });
}

/**
 * Known coordinate fallbacks for key target micro-markets
 */
const CITY_COORDINATES = {
  // Dubai Micro-markets
  'business bay': { lat: 25.1866, lon: 55.2644 },
  'dubai marina': { lat: 25.0805, lon: 55.1403 },
  'downtown dubai': { lat: 25.1972, lon: 55.2744 },
  'jlt': { lat: 25.0747, lon: 55.1437 },
  'jumeirah lake towers': { lat: 25.0747, lon: 55.1437 },
  'jvc': { lat: 25.0601, lon: 55.2078 },
  'deira': { lat: 25.2697, lon: 55.3095 },
  'bur dubai': { lat: 25.2532, lon: 55.3005 },
  'al barsha': { lat: 25.1051, lon: 55.2001 },
  'difc': { lat: 25.2104, lon: 55.2801 },
  'dubai': { lat: 25.2048, lon: 55.2708 },

  // India Target Hubs
  'delhi': { lat: 28.6139, lon: 77.2090 },
  'delhi ncr': { lat: 28.5355, lon: 77.3910 },
  'noida': { lat: 28.5355, lon: 77.3910 },
  'gurugram': { lat: 28.4595, lon: 77.0266 },
  'mumbai': { lat: 19.0760, lon: 72.8777 },
  'bengaluru': { lat: 12.9716, lon: 77.5946 },
  'bangalore': { lat: 12.9716, lon: 77.5946 },
  'hyderabad': { lat: 17.3850, lon: 78.4867 },
  'pune': { lat: 18.5204, lon: 73.8567 },
  'kolkata': { lat: 22.5726, lon: 88.3639 },
  'chennai': { lat: 13.0827, lon: 80.2707 },
  'ahmedabad': { lat: 23.0225, lon: 72.5714 },
  'patna': { lat: 25.5941, lon: 85.1376 },
  'bokaro': { lat: 23.6693, lon: 86.1511 },
  'ranchi': { lat: 23.3441, lon: 85.3096 }
};

/**
 * Executes a live prospect discovery run using the local Google Maps Go scraper
 */
async function discoverLeads({
  country,
  city,
  area,
  industry,
  keywords,
  radius = 5000,
  campaignId = null
}) {
  logActivity('discovery', `Starting discovery in ${area ? area + ', ' : ''}${city}, ${country} for "${keywords || industry}"`, 'info');

  const locKey = (area || city || '').toLowerCase().trim();
  let coords = CITY_COORDINATES[locKey];

  if (!coords) {
    const geoQuery = `${area ? area + ', ' : ''}${city}, ${country}`;
    coords = await geocodeLocation(geoQuery);
  }

  if (!coords) {
    coords = country.toUpperCase() === 'UAE' ? { lat: 25.2048, lon: 55.2708 } : { lat: 28.6139, lon: 77.2090 };
  }

  const queryTerm = keywords || `${industry} in ${area ? area + ' ' : ''}${city}`;
  const runId = `job_${Date.now()}`;
  const tempDir = path.join(os.tmpdir(), `lucid_${runId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const inputFile = path.join(tempDir, 'queries.txt');
  const resultsFile = path.join(tempDir, 'results.json');
  fs.writeFileSync(inputFile, `${queryTerm}\n`, 'utf8');

  const args = [
    '-input', inputFile,
    '-results', resultsFile,
    '-json',
    '-fast-mode',
    '-geo', `${coords.lat},${coords.lon}`,
    '-radius', radius.toString(),
    '-exit-on-inactivity', '1m'
  ];

  return new Promise((resolve) => {
    const proc = spawn(SCRAPER_BIN, args, { cwd: path.dirname(SCRAPER_BIN) });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', async (code) => {
      if (!fs.existsSync(resultsFile)) {
        logActivity('discovery', `Scraper finished with code ${code} but no results file found`, 'warning');
        return resolve({ success: false, items: [], count: 0 });
      }

      try {
        const raw = fs.readFileSync(resultsFile, 'utf8');
        const rawItems = JSON.parse(raw);

        if (!Array.isArray(rawItems)) {
          return resolve({ success: true, items: [], count: 0 });
        }

        const insertedLeads = [];
        const insertStmt = db.prepare(`
          INSERT INTO prospects (
            id, campaign_id, is_demo, business_name, category, categories,
            country, city, area, address, latitude, longitude, timezone,
            phone, phone_clean, website, email, email_status, email_source,
            instagram_url, facebook_url, linkedin_url, twitter_url, google_maps_url,
            place_id, rating, review_count, opening_hours, website_status,
            website_has_ssl, website_title, website_description, identified_problems,
            recommended_services, executive_opportunity_brief, opportunity_score,
            confidence_score, priority_tier, score_breakdown, discovery_source,
            dedup_hash, status
          ) VALUES (
            @id, @campaign_id, 0, @business_name, @category, @categories,
            @country, @city, @area, @address, @latitude, @longitude, @timezone,
            @phone, @phone_clean, @website, @email, @email_status, @email_source,
            @instagram_url, @facebook_url, @linkedin_url, @twitter_url, @google_maps_url,
            @place_id, @rating, @review_count, @opening_hours, @website_status,
            @website_has_ssl, @website_title, @website_description, @identified_problems,
            @recommended_services, @executive_opportunity_brief, @opportunity_score,
            @confidence_score, @priority_tier, @score_breakdown, 'Local Engine',
            @dedup_hash, 'New Lead'
          )
          ON CONFLICT(dedup_hash) DO UPDATE SET
            phone = COALESCE(prospects.phone, excluded.phone),
            website = COALESCE(prospects.website, excluded.website),
            rating = CASE WHEN excluded.rating > 0 THEN excluded.rating ELSE prospects.rating END,
            review_count = CASE WHEN excluded.review_count > 0 THEN excluded.review_count ELSE prospects.review_count END,
            updated_at = CURRENT_TIMESTAMP
        `);

        for (const item of rawItems) {
          const leadObj = {
            id: `prospect_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            campaign_id: campaignId,
            business_name: item.title || 'Untitled Business',
            category: item.category || (item.categories && item.categories[0]) || industry || 'Business',
            categories: JSON.stringify(item.categories || []),
            country: country.toUpperCase() === 'UAE' ? 'UAE' : 'India',
            city: city || 'Dubai',
            area: area || '',
            address: item.address || '',
            latitude: Number(item.latitude) || coords.lat,
            longitude: Number(item.longitude || item.longtitude) || coords.lon,
            timezone: item.timezone || (country.toUpperCase() === 'UAE' ? 'Asia/Dubai' : 'Asia/Kolkata'),
            phone: item.phone || '',
            phone_clean: (item.phone || '').replace(/[^0-9+]/g, ''),
            website: item.web_site || item.website || '',
            email: (item.emails && item.emails[0]) || null,
            email_status: (item.emails && item.emails[0]) ? 'discovered' : 'unverified',
            email_source: (item.emails && item.emails[0]) ? 'Google Maps metadata' : null,
            instagram_url: null,
            facebook_url: null,
            linkedin_url: null,
            twitter_url: null,
            google_maps_url: item.link || '',
            place_id: item.place_id || item.data_id || '',
            rating: Number(item.review_rating || item.rating) || 0,
            review_count: Number(item.review_count) || 0,
            opening_hours: JSON.stringify(item.open_hours || {}),
            website_status: item.web_site ? 'unverified' : 'missing',
            website_has_ssl: 0,
            website_title: null,
            website_description: null,
            identified_problems: '[]',
            recommended_services: '[]',
            executive_opportunity_brief: '',
            opportunity_score: 50,
            confidence_score: 50,
            priority_tier: 'Medium',
            score_breakdown: '{}'
          };

          leadObj.dedup_hash = computeDedupHash(leadObj);

          // Initial scoring
          const evalRes = evaluateProspect(leadObj, {});
          leadObj.opportunity_score = evalRes.opportunityScore;
          leadObj.confidence_score = evalRes.confidenceScore;
          leadObj.priority_tier = evalRes.priorityTier;
          leadObj.identifiedProblems = JSON.stringify(evalRes.identifiedProblems);
          leadObj.recommendedServices = JSON.stringify(evalRes.recommendedServices);
          leadObj.executive_opportunity_brief = evalRes.executiveBrief;

          try {
            insertStmt.run(leadObj);
            insertedLeads.push(leadObj);
          } catch (e) {
            // Already present or duplicate
          }
        }

        logActivity('discovery', `Successfully ingested ${insertedLeads.length} leads into CRM database`, 'success');
        resolve({ success: true, count: insertedLeads.length, items: insertedLeads });
      } catch (err) {
        logActivity('discovery', `Failed parsing discovery results: ${err.message}`, 'error');
        resolve({ success: false, error: err.message, items: [] });
      }
    });
  });
}

module.exports = {
  discoverLeads,
  geocodeLocation
};
