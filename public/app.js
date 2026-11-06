// LucidMediax Growth Intelligence Application State
let currentTab = 'overview';
let activeMarketFilter = 'all'; // 'all', 'UAE', 'India'
let crmPage = 0;
const CRM_PAGE_SIZE = 25;
let debounceTimer = null;

// Outreach Studio State
let selectedProspectId = null;
let currentOutreachData = null;
let activeChannel = 'email';

// Fetch Interceptor with Master Token Injection
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
  const token = localStorage.getItem('lm_auth_token');
  options = options || {};
  options.headers = options.headers || {};
  
  if (token) {
    if (options.headers instanceof Headers) {
      if (!options.headers.has('Authorization')) {
        options.headers.set('Authorization', `Bearer ${token}`);
      }
    } else {
      if (!options.headers['Authorization'] && !options.headers['authorization']) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }

  const res = await originalFetch(url, options);
  if (res.status === 401 && typeof url === 'string' && !url.includes('/api/auth/login')) {
    localStorage.removeItem('lm_auth_token');
    showAuthModal('Master authentication expired or access revoked. Please enter master password.');
  }
  return res;
};

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  checkAuthOnLoad();
});

// Navigation
function initNav() {
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });
}

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
  const targetBtn = document.querySelector(`.nav-link[data-tab="${tabId}"]`);
  if (targetBtn) targetBtn.classList.add('active');

  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const targetPanel = document.getElementById(`panel-${tabId}`);
  if (targetPanel) targetPanel.classList.add('active');

  const titles = {
    overview: ['Overview Dashboard', 'High-intent client acquisition pipeline for Dubai & India'],
    workflow: ['Get First Clients', '10-step execution framework to close initial retainer accounts'],
    discover: ['Discover Leads', 'Target localized micro-markets with automated Google Maps extraction'],
    crm: ['Prospect CRM', 'Qualify, inspect weaknesses, update stages, and track client pipeline'],
    outreach: ['Outreach Studio', 'Observation-led cold emails, WhatsApp notes & Instagram DMs'],
    tracker: ['Outreach Tracker & Situation Radar', 'Real-time monitoring of every outreach touchpoint, channel, and reply situation'],
    analytics: ['Market Analytics', 'Performance metrics comparing UAE vs India conversions'],
    settings: ['Settings & APIs', 'Adapter health checks, export tools & configuration']
  };

  if (titles[tabId]) {
    document.getElementById('view-title').textContent = titles[tabId][0];
    document.getElementById('view-subtitle').textContent = titles[tabId][1];
  }

  if (tabId === 'overview') loadDashboard();
  if (tabId === 'crm') fetchProspects();
  if (tabId === 'outreach') loadOutreachProspects();
  if (tabId === 'tracker') fetchTracker();
  if (tabId === 'settings') { checkAdapterStatuses(); loadSmtpSettings(); }
}

function setMarketFilter(market) {
  activeMarketFilter = market;
  document.querySelectorAll('.market-btn').forEach(b => b.classList.remove('active'));
  if (market === 'all') document.getElementById('btn-market-all').classList.add('active');
  if (market === 'UAE') document.getElementById('btn-market-dubai').classList.add('active');
  if (market === 'India') document.getElementById('btn-market-india').classList.add('active');

  fetchProspects();
  loadDashboard();
  if (currentTab === 'tracker') fetchTracker();
}

// -------------------------------------------------------------
// 1. DASHBOARD OVERVIEW
// -------------------------------------------------------------
async function loadDashboard() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    document.getElementById('kpi-total').textContent = data.totalDiscovered.toLocaleString();
    document.getElementById('kpi-qualified').textContent = data.qualifiedCount.toLocaleString();
    document.getElementById('kpi-dubai').textContent = data.dubaiCount.toLocaleString();
    document.getElementById('kpi-india').textContent = data.indiaCount.toLocaleString();
    document.getElementById('kpi-contacts').textContent = data.verifiedContacts.toLocaleString();
    document.getElementById('kpi-wins').textContent = (data.meetingsScheduled + data.clientsWon).toLocaleString();

    // Analytics Market Bars
    const totalMarket = (data.dubaiCount + data.indiaCount) || 1;
    document.getElementById('an-dubai-count').textContent = data.dubaiCount;
    document.getElementById('an-india-count').textContent = data.indiaCount;
    document.getElementById('an-dubai-bar').style.width = `${Math.round((data.dubaiCount / totalMarket) * 100)}%`;
    document.getElementById('an-india-bar').style.width = `${Math.round((data.indiaCount / totalMarket) * 100)}%`;

    // Render Recent Logs Feed
    const feed = document.getElementById('overview-log-feed');
    if (data.recentLogs && data.recentLogs.length > 0) {
      feed.innerHTML = data.recentLogs.map(l => `
        <div class="feed-item ${l.level}">
          <span style="opacity: 0.6;">[${new Date(l.created_at).toLocaleTimeString()}]</span>
          <strong>[${escapeHtml(l.module)}]</strong> ${escapeHtml(l.message)}
        </div>
      `).join('');
    }

    // Load top 5 qualified prospects
    loadTopOpportunities();
  } catch (err) {
    console.error('Failed loading stats:', err);
  }
}

async function loadTopOpportunities() {
  const tbody = document.getElementById('top-prospects-tbody');
  try {
    const res = await fetch('/api/prospects?priority=Excellent&limit=5');
    const data = await res.json();

    if (!data.prospects || data.prospects.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-secondary">No top opportunities yet. Ingest verified datasets or launch discovery!</td></tr>';
      return;
    }

    tbody.innerHTML = data.prospects.map(p => {
      let problems = [];
      try { problems = JSON.parse(p.identified_problems || '[]'); } catch {}
      const problemTag = problems[0] ? `<span class="stage-badge">${escapeHtml(problems[0])}</span>` : 'Needs SEO';

      return `
        <tr>
          <td><div class="score-badge excellent">${p.opportunity_score}</div></td>
          <td>
            <strong>${escapeHtml(p.business_name)}</strong>
            <div class="text-secondary text-sm">${escapeHtml(p.category)}</div>
          </td>
          <td>${p.country === 'UAE' ? '🇦🇪 Dubai' : '🇮🇳 ' + escapeHtml(p.city)}</td>
          <td>
            ${p.phone ? `<div>📞 ${escapeHtml(p.phone)}</div>` : ''}
            ${p.email ? `<div class="text-success">✉️ ${escapeHtml(p.email)}</div>` : ''}
          </td>
          <td>${problemTag}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="openOutreachForLead('${p.id}')">Pitch Lead</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">${err.message}</td></tr>`;
  }
}

// -------------------------------------------------------------
// 2. DISCOVERY ENGINE
// -------------------------------------------------------------
function updateLocationPresets(country) {
  const cityInput = document.getElementById('disc-city');
  const areaSelect = document.getElementById('disc-area');

  if (country === 'UAE') {
    cityInput.value = 'Dubai';
    areaSelect.innerHTML = `
      <option value="Business Bay">Business Bay</option>
      <option value="Dubai Marina">Dubai Marina</option>
      <option value="Downtown Dubai">Downtown Dubai</option>
      <option value="JLT">Jumeirah Lake Towers (JLT)</option>
      <option value="JVC">Jumeirah Village Circle (JVC)</option>
      <option value="Deira">Deira</option>
      <option value="Bur Dubai">Bur Dubai</option>
      <option value="DIFC">DIFC</option>
      <option value="Al Barsha">Al Barsha</option>
    `;
  } else {
    cityInput.value = 'Delhi NCR';
    areaSelect.innerHTML = `
      <option value="">Whole City Metro</option>
      <option value="South Delhi">South Delhi</option>
      <option value="Gurugram Cyber City">Gurugram Cyber City</option>
      <option value="Noida Sector 62">Noida Sector 62</option>
      <option value="Bandra West">Bandra West (Mumbai)</option>
      <option value="Indiranagar">Indiranagar (Bengaluru)</option>
      <option value="Koramangala">Koramangala (Bengaluru)</option>
      <option value="Boring Road">Boring Road (Patna)</option>
      <option value="Sector 4">Sector 4 (Bokaro)</option>
    `;
  }
}

function updateKeywordFromIndustry(ind) {
  document.getElementById('disc-keyword').value = ind;
}

async function handleStartDiscovery(e) {
  e.preventDefault();
  const country = document.getElementById('disc-country').value;
  const city = document.getElementById('disc-city').value.trim();
  const area = document.getElementById('disc-area').value;
  const industry = document.getElementById('disc-industry').value;
  const keywords = document.getElementById('disc-keyword').value.trim();
  const radius = document.getElementById('disc-radius').value;

  const btn = document.getElementById('btn-run-disc');
  btn.disabled = true;
  btn.textContent = 'Launching Scraper...';

  const monitor = document.getElementById('active-scrape-progress');
  monitor.style.display = 'block';
  document.getElementById('monitor-heading').textContent = `Scraping ${keywords || industry} in ${area ? area + ', ' : ''}${city}...`;

  try {
    const res = await fetch('/api/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, city, area, industry, keywords, radius })
    });
    const data = await res.json();

    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = '🚀 Launch Prospect Discovery';
      monitor.style.display = 'none';
      switchTab('crm');
      fetchProspects();
    }, 4500);
  } catch (err) {
    alert(`Failed launching discovery: ${err.message}`);
    btn.disabled = false;
    btn.textContent = '🚀 Launch Prospect Discovery';
    monitor.style.display = 'none';
  }
}

// -------------------------------------------------------------
// 3. PROSPECT CRM
// -------------------------------------------------------------
function debounceFetchProspects() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    crmPage = 0;
    fetchProspects();
  }, 300);
}

async function fetchProspects() {
  const search = document.getElementById('crm-search').value.trim();
  const status = document.getElementById('crm-filter-status').value;
  const priority = document.getElementById('crm-filter-tier').value;
  const hasEmail = document.getElementById('crm-has-email').checked;
  const hasPhone = document.getElementById('crm-has-phone').checked;
  const hasWebsite = document.getElementById('crm-has-web').checked;

  const params = new URLSearchParams({
    search,
    status,
    priority,
    hasEmail: hasEmail ? 'true' : '',
    hasPhone: hasPhone ? 'true' : '',
    hasWebsite: hasWebsite ? 'true' : '',
    limit: CRM_PAGE_SIZE,
    offset: crmPage * CRM_PAGE_SIZE
  });

  if (activeMarketFilter !== 'all') {
    params.set('country', activeMarketFilter);
  }

  const tbody = document.getElementById('prospects-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-secondary">Loading pipeline...</td></tr>';

  try {
    const res = await fetch(`/api/prospects?${params.toString()}`);
    const data = await res.json();

    document.getElementById('crm-count-label').textContent = `Showing ${data.prospects.length} of ${data.total} qualified prospects`;
    document.getElementById('btn-prev-page').disabled = crmPage === 0;
    document.getElementById('btn-next-page').disabled = (crmPage + 1) * CRM_PAGE_SIZE >= data.total;

    if (!data.prospects || data.prospects.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-secondary">No prospects match the filter criteria.</td></tr>';
      return;
    }

    tbody.innerHTML = data.prospects.map(p => {
      const scoreTier = p.opportunity_score >= 85 ? 'excellent' : (p.opportunity_score >= 70 ? 'high' : (p.opportunity_score >= 50 ? 'potential' : 'low'));
      let services = [];
      try { services = JSON.parse(p.recommended_services || '[]'); } catch {}

      return `
        <tr>
          <td><div class="score-badge ${scoreTier}">${p.opportunity_score}</div></td>
          <td>
            <strong>${escapeHtml(p.business_name)}</strong>
            ${p.website ? `<div><a href="${escapeHtml(p.website)}" target="_blank" style="color: #60a5fa; font-size: 11px; text-decoration: none;">🌐 ${new URL(p.website).hostname}</a></div>` : ''}
          </td>
          <td>
            <span style="font-size: 11px; font-weight: 600;">${p.country === 'UAE' ? '🇦🇪 Dubai' : '🇮🇳 ' + escapeHtml(p.city)}</span>
            <div class="text-secondary text-sm">${escapeHtml(p.area || '')}</div>
          </td>
          <td>
            ${p.phone ? `<div>📞 <a href="tel:${escapeHtml(p.phone)}" style="color: inherit; text-decoration: none;">${escapeHtml(p.phone)}</a></div>` : ''}
            ${p.email ? `<div class="text-success">✉️ <a href="mailto:${escapeHtml(p.email)}" style="color: inherit; text-decoration: none;">${escapeHtml(p.email)}</a></div>` : ''}
          </td>
          <td>
            ${p.rating ? `⭐ <strong>${p.rating}</strong> (${p.review_count})` : '<span class="text-secondary">No reviews</span>'}
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              ${services.slice(0, 2).map(s => `<span class="stage-badge">${escapeHtml(s)}</span>`).join('')}
            </div>
          </td>
          <td>
            <select class="btn btn-sm btn-secondary" onchange="updateStage('${p.id}', this.value)">
              ${['New Lead', 'Researched', 'Qualified', 'Ready to Approach', 'Contacted', 'Meeting Scheduled', 'Proposal Sent', 'Won', 'Lost']
                .map(st => `<option value="${st}" ${p.status === st ? 'selected' : ''}>${st}</option>`).join('')}
            </select>
          </td>
          <td>
            <div class="flex gap-2">
              <button class="btn btn-sm btn-outline" title="Live Web & DNS Audit" onclick="runLiveAudit('${p.id}')">🔍 Audit</button>
              <button class="btn btn-sm btn-primary" title="Open Outreach Pitch" onclick="openOutreachForLead('${p.id}')">✉️ Pitch</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${err.message}</td></tr>`;
  }
}

function prevProspectsPage() {
  if (crmPage > 0) { crmPage--; fetchProspects(); }
}

function nextProspectsPage() {
  crmPage++; fetchProspects();
}

async function updateStage(id, status) {
  try {
    await fetch(`/api/prospects/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

async function runLiveAudit(id) {
  try {
    const res = await fetch(`/api/prospects/${id}/audit`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(`Audit completed! New Opportunity Score: ${data.evaluation.opportunityScore}/100. Discovered: ${data.audit.emails.length} email(s).`);
      fetchProspects();
      loadDashboard();
    } else {
      alert(`Audit note: ${data.error || 'Website unreachable'}`);
    }
  } catch (err) {
    alert(err.message);
  }
}

// -------------------------------------------------------------
// 4. OUTREACH STUDIO
// -------------------------------------------------------------
async function loadOutreachProspects() {
  const container = document.getElementById('outreach-prospect-list');
  try {
    const res = await fetch('/api/prospects?limit=50');
    const data = await res.json();

    if (!data.prospects || data.prospects.length === 0) {
      container.innerHTML = '<div class="text-secondary p-3">No prospects ready. Ingest datasets or run discovery.</div>';
      return;
    }

    container.innerHTML = data.prospects.map(p => `
      <div class="prospect-selector-item ${selectedProspectId === p.id ? 'active' : ''}" onclick="selectOutreachProspect('${p.id}')">
        <strong>${escapeHtml(p.business_name)}</strong>
        <div class="flex justify-between text-sm mt-1">
          <span class="text-secondary">${p.country === 'UAE' ? '🇦🇪 Dubai' : '🇮🇳 ' + p.city}</span>
          <span class="score-badge ${p.opportunity_score >= 85 ? 'excellent' : (p.opportunity_score >= 70 ? 'high' : 'potential')}">${p.opportunity_score}</span>
        </div>
      </div>
    `).join('');

    if (!selectedProspectId && data.prospects[0]) {
      selectOutreachProspect(data.prospects[0].id);
    }
  } catch (err) {
    container.innerHTML = `<div class="text-danger p-3">${err.message}</div>`;
  }
}

async function selectOutreachProspect(id) {
  selectedProspectId = id;
  document.querySelectorAll('.prospect-selector-item').forEach(el => el.classList.remove('active'));
  const currentItem = document.querySelector(`.prospect-selector-item[onclick="selectOutreachProspect('${id}')"]`);
  if (currentItem) currentItem.classList.add('active');

  try {
    const res = await fetch(`/api/prospects/${id}`);
    const data = await res.json();
    const p = data.prospect;
    currentOutreachData = data.outreach;

    document.getElementById('outreach-lead-name').textContent = p.business_name;
    document.getElementById('outreach-lead-meta').textContent = `${p.category} in ${p.city}, ${p.country} • Opportunity Score: ${p.opportunity_score}/100`;

    // Populate Verified Contact Dossier Card
    document.getElementById('dossier-company').textContent = p.business_name;
    
    // Email
    const emailElem = document.getElementById('dossier-email');
    if (p.email) {
      emailElem.innerHTML = `<a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a> <span class="stage-badge won">${p.email_status === 'dns_verified' ? '✓ MX Verified' : 'Discovered'}</span>`;
    } else {
      emailElem.innerHTML = `<span class="text-secondary">Not found yet</span> <button class="btn btn-sm btn-ghost" onclick="runLiveAudit('${p.id}')" title="Scan website for contact email">Scan Web ↗</button>`;
    }

    // Phone / WhatsApp
    const phoneElem = document.getElementById('dossier-phone');
    if (p.phone) {
      phoneElem.innerHTML = `<a href="tel:${escapeHtml(p.phone)}">${escapeHtml(p.phone)}</a> <a href="https://wa.me/${p.phone_clean}" target="_blank" class="stage-badge ready" style="text-decoration:none;">💬 WhatsApp</a>`;
    } else {
      phoneElem.innerHTML = '<span class="text-secondary">None</span>';
    }

    // LinkedIn
    const linkedinElem = document.getElementById('dossier-linkedin');
    if (p.linkedin_url) {
      linkedinElem.innerHTML = `<a href="${escapeHtml(p.linkedin_url)}" target="_blank">🔗 Company Profile ↗</a>`;
    } else {
      linkedinElem.innerHTML = `<span class="text-secondary">None</span> <button class="btn btn-sm btn-ghost" onclick="runLiveAudit('${p.id}')">Audit ↗</button>`;
    }

    // Instagram
    const igElem = document.getElementById('dossier-instagram');
    if (p.instagram_url) {
      igElem.innerHTML = `<a href="${escapeHtml(p.instagram_url)}" target="_blank">📸 @${escapeHtml(p.instagram_url.split('/').filter(Boolean).pop())} ↗</a>`;
    } else {
      igElem.innerHTML = '<span class="text-secondary">None detected</span>';
    }

    // Decision Maker
    const dmElem = document.getElementById('dossier-decision-maker');
    if (p.decision_maker_name) {
      dmElem.textContent = `${p.decision_maker_name} (${p.decision_maker_title || 'Lead'})`;
    } else {
      dmElem.textContent = 'Managing Director / Marketing Head';
    }

    // Quick Action Links
    const linksDiv = document.getElementById('outreach-quick-links');
    const links = [];
    if (p.website) links.push(`<a href="${escapeHtml(p.website)}" target="_blank" class="btn btn-sm btn-outline">🌐 Visit Website</a>`);
    if (p.phone) links.push(`<a href="https://wa.me/${p.phone_clean}" target="_blank" class="btn btn-sm btn-secondary">💬 Open WhatsApp</a>`);
    if (p.email) links.push(`<a href="mailto:${escapeHtml(p.email)}" class="btn btn-sm btn-secondary">✉️ Open Email App</a>`);
    if (p.linkedin_url) links.push(`<a href="${escapeHtml(p.linkedin_url)}" target="_blank" class="btn btn-sm btn-secondary">💼 LinkedIn</a>`);
    if (p.instagram_url) links.push(`<a href="${escapeHtml(p.instagram_url)}" target="_blank" class="btn btn-sm btn-secondary">📸 Instagram</a>`);
    linksDiv.innerHTML = links.join(' ');

    // Configure Direct Email Button
    const sendBtn = document.getElementById('btn-send-email-direct');
    if (sendBtn) {
      if (p.email) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `🚀 Direct Send to ${escapeHtml(p.email)}`;
        sendBtn.title = `Send this drafted email directly to ${p.email}`;
      } else {
        sendBtn.disabled = true;
        sendBtn.innerHTML = `⚠️ No Email Discovered`;
        sendBtn.title = `Run web audit to discover contact email`;
      }
    }

    // Render Prior Outreach History for this company
    renderCompanyOutreachHistory(data.outreachHistory || []);

    renderOutreachChannel(activeChannel);
  } catch (err) {
    alert(err.message);
  }
}

function renderCompanyOutreachHistory(history) {
  const countBadge = document.getElementById('history-count-badge');
  const tbody = document.getElementById('company-history-tbody');
  if (countBadge) countBadge.textContent = `${history.length} touches`;

  if (!tbody) return;

  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-3 text-secondary">No prior touchpoints recorded for this prospect yet.</td></tr>';
    return;
  }

  tbody.innerHTML = history.map(item => {
    const channelIcons = {
      email: '✉️ Email',
      whatsapp: '💬 WhatsApp',
      linkedin: '💼 LinkedIn',
      instagram: '📸 Instagram',
      phone: '📞 Phone',
      follow_up_3d: '⏱️ Follow-up (3d)',
      follow_up_7d: '⏱️ Follow-up (7d)'
    };

    return `
      <tr>
        <td><strong>${channelIcons[item.channel] || item.channel}</strong></td>
        <td><code>${escapeHtml(item.recipient_contact)}</code></td>
        <td>
          <span style="cursor:pointer; color:#60a5fa;" onclick='viewOutreachMessage(${JSON.stringify(item)})' title="Click to view full message">
            ${escapeHtml((item.subject || item.message).slice(0, 32))}...
          </span>
        </td>
        <td>${new Date(item.sent_at).toLocaleDateString()}</td>
        <td><span class="stage-badge ready">${escapeHtml(item.situation)}</span></td>
        <td>
          <select class="situation-select" onchange="updateOutreachSituation('${item.id}', this.value)">
            ${['Awaiting Reply', 'Follow-up Due', 'Responded - Interested', 'Meeting Scheduled', 'Proposal Sent', 'Won', 'Responded - Not Interested', 'Bounced']
              .map(s => `<option value="${s}" ${item.situation === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
      </tr>
    `;
  }).join('');
}

// -------------------------------------------------------------
// DIRECT EMAIL SEND & INTERACTION LOGGERS
// -------------------------------------------------------------
async function sendEmailDirect() {
  if (!selectedProspectId) {
    alert('Please select a prospect first.');
    return;
  }

  const subject = document.getElementById('outreach-subject').value.trim();
  const body = document.getElementById('outreach-body').value.trim();

  if (!subject || !body) {
    alert('Subject and body cannot be empty.');
    return;
  }

  const btn = document.getElementById('btn-send-email-direct');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = '🚀 Dispatching Email...';

  try {
    const res = await fetch('/api/outreach/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospectId: selectedProspectId,
        subject,
        body
      })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    alert(`✓ ${data.message}\n\nDelivery Status: ${data.deliveryStatus.toUpperCase()}\nFollow-up Scheduled: in 3 days (${data.followUpDue.slice(0, 10)})`);

    // Reload prospect details to refresh prior history and CRM status
    await selectOutreachProspect(selectedProspectId);
    loadDashboard();
    fetchProspects();
  } catch (err) {
    alert(`Email Dispatch Notice: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function logChannelInteraction(channel) {
  if (!selectedProspectId) {
    alert('Please select a prospect first.');
    return;
  }

  const note = prompt(`Log ${channel.toUpperCase()} Outreach:\nEnter notes or observation summary:`, `Approached via ${channel} regarding digital marketing growth`);
  if (!note) return;

  try {
    const res = await fetch('/api/outreach/log-interaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospectId: selectedProspectId,
        channel,
        message: note,
        situation: 'Awaiting Reply',
        followUpDays: 3
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    alert(`✓ ${channel.toUpperCase()} touchpoint recorded in Outreach Tracker! Follow-up due in 3 days.`);
    await selectOutreachProspect(selectedProspectId);
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

function openOutreachForLead(id) {
  switchTab('outreach');
  selectOutreachProspect(id);
}

function switchChannel(channel) {
  activeChannel = channel;
  document.querySelectorAll('.channel-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.channel-tab[data-channel="${channel}"]`);
  if (activeTab) activeTab.classList.add('active');

  renderOutreachChannel(channel);
}

function renderOutreachChannel(channel) {
  if (!currentOutreachData) return;

  const subjectWrap = document.getElementById('email-subject-wrap');
  const subjectInput = document.getElementById('outreach-subject');
  const bodyText = document.getElementById('outreach-body');

  if (channel === 'email') {
    subjectWrap.style.display = 'block';
    subjectInput.value = currentOutreachData.coldEmail.subject;
    bodyText.value = currentOutreachData.coldEmail.body;
  } else if (channel === 'whatsapp') {
    subjectWrap.style.display = 'none';
    bodyText.value = currentOutreachData.whatsapp.body;
  } else if (channel === 'instagram') {
    subjectWrap.style.display = 'none';
    bodyText.value = currentOutreachData.instagram.body;
  } else if (channel === 'linkedin') {
    subjectWrap.style.display = 'none';
    bodyText.value = currentOutreachData.linkedin.body;
  } else if (channel === 'followup') {
    subjectWrap.style.display = 'block';
    subjectInput.value = currentOutreachData.followUp3d.subject;
    bodyText.value = currentOutreachData.followUp3d.body;
  }
}

function copyOutreachText() {
  const body = document.getElementById('outreach-body').value;
  navigator.clipboard.writeText(body).then(() => {
    alert('Pitch copied to clipboard!');
  });
}

async function markAsContacted() {
  if (!selectedProspectId) return;
  await updateStage(selectedProspectId, 'Contacted');
  alert('Prospect marked as Contacted in CRM!');
}

// -------------------------------------------------------------
// 5. INGEST VERIFIED DATASETS
// -------------------------------------------------------------
async function importVerifiedPreExistingData() {
  try {
    const res = await fetch('/api/import/existing', { method: 'POST' });
    const data = await res.json();
    alert(`Success! Deduplicated and ingested ${data.count} real prospects across Dubai and India.`);
    loadDashboard();
    fetchProspects();
  } catch (err) {
    alert(err.message);
  }
}

// -------------------------------------------------------------
// 6. SETTINGS & ADAPTER HEALTH
// -------------------------------------------------------------
async function checkAdapterStatuses() {
  const grid = document.getElementById('adapters-diagnostics-grid');
  try {
    const res = await fetch('/api/adapters/status');
    const data = await res.json();

    grid.innerHTML = `
      <div class="adapter-box active">
        <div class="flex justify-between">
          <h4>Google Maps Local Engine</h4>
          <span class="stage-badge won">${data.localScraper.status}</span>
        </div>
        <p class="text-secondary text-sm mt-2">${data.localScraper.message}</p>
        <div class="text-dim text-sm mt-1">Binary: <code>${data.localScraper.path}</code></div>
      </div>

      <div class="adapter-box active">
        <div class="flex justify-between">
          <h4>Direct Web & DNS MX Auditor</h4>
          <span class="stage-badge won">${data.directWebAuditor.status}</span>
        </div>
        <p class="text-secondary text-sm mt-2">${data.directWebAuditor.message}</p>
        <div class="text-dim text-sm mt-1">SSL, Title, Description, Emails, Social discovery</div>
      </div>

      <div class="adapter-box ${data.apify.configured ? 'active' : ''}">
        <div class="flex justify-between">
          <h4>Apify Actor Cloud Engine</h4>
          <span class="stage-badge ${data.apify.configured ? 'won' : 'low'}">${data.apify.status}</span>
        </div>
        <p class="text-secondary text-sm mt-2">${data.apify.message}</p>
      </div>

      <div class="adapter-box ${data.pageSpeed.configured ? 'active' : ''}">
        <div class="flex justify-between">
          <h4>Google PageSpeed Insights API</h4>
          <span class="stage-badge ${data.pageSpeed.configured ? 'won' : 'low'}">${data.pageSpeed.status}</span>
        </div>
        <p class="text-secondary text-sm mt-2">${data.pageSpeed.message}</p>
      </div>
    `;
  } catch (err) {
    grid.innerHTML = `<div class="text-danger p-3">${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// 7. OUTREACH TRACKER COCKPIT
// -------------------------------------------------------------
let trackerPage = 0;
const TRACKER_PAGE_SIZE = 25;
let trackerDebounceTimer = null;
let currentViewingMessage = null;

function debounceFetchTracker() {
  clearTimeout(trackerDebounceTimer);
  trackerDebounceTimer = setTimeout(() => {
    trackerPage = 0;
    fetchTracker();
  }, 300);
}

async function fetchTracker() {
  const search = document.getElementById('tracker-search') ? document.getElementById('tracker-search').value.trim() : '';
  const channel = document.getElementById('tracker-filter-channel') ? document.getElementById('tracker-filter-channel').value : 'all';
  const situation = document.getElementById('tracker-filter-situation') ? document.getElementById('tracker-filter-situation').value : 'all';

  const params = new URLSearchParams({
    search,
    channel,
    situation,
    limit: TRACKER_PAGE_SIZE,
    offset: trackerPage * TRACKER_PAGE_SIZE
  });

  if (activeMarketFilter !== 'all') {
    params.set('market', activeMarketFilter);
  }

  const tbody = document.getElementById('tracker-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-secondary">Updating outreach tracker...</td></tr>';

  try {
    const res = await fetch(`/api/outreach/tracker?${params.toString()}`);
    const data = await res.json();

    // Update KPI Ribbon
    if (data.metrics) {
      if (document.getElementById('tr-kpi-approached')) document.getElementById('tr-kpi-approached').textContent = data.metrics.totalApproached;
      if (document.getElementById('tr-kpi-emails')) document.getElementById('tr-kpi-emails').textContent = data.metrics.emailCount;
      if (document.getElementById('tr-kpi-whatsapp')) document.getElementById('tr-kpi-whatsapp').textContent = data.metrics.whatsappCount;
      if (document.getElementById('tr-kpi-awaiting')) document.getElementById('tr-kpi-awaiting').textContent = data.metrics.awaitingReply;
      if (document.getElementById('tr-kpi-followups')) document.getElementById('tr-kpi-followups').textContent = data.metrics.followUpDue;
      if (document.getElementById('tr-kpi-meetings')) document.getElementById('tr-kpi-meetings').textContent = data.metrics.positiveReplies;
    }

    if (document.getElementById('tracker-count-label')) {
      document.getElementById('tracker-count-label').textContent = `Showing ${data.logs.length} of ${data.total} recorded touchpoints`;
    }

    if (document.getElementById('btn-tracker-prev')) {
      document.getElementById('btn-tracker-prev').disabled = trackerPage === 0;
    }
    if (document.getElementById('btn-tracker-next')) {
      document.getElementById('btn-tracker-next').disabled = (trackerPage + 1) * TRACKER_PAGE_SIZE >= data.total;
    }

    if (!data.logs || data.logs.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-secondary">No outreach touchpoints recorded yet. Use Outreach Studio to dispatch cold emails or log WhatsApp chats!</td></tr>';
      return;
    }

    const channelLabels = {
      email: '✉️ Email',
      whatsapp: '💬 WhatsApp',
      linkedin: '💼 LinkedIn',
      instagram: '📸 Instagram',
      phone: '📞 Phone Call',
      follow_up_3d: '⏱️ Follow-up (3d)',
      follow_up_7d: '⏱️ Follow-up (7d)'
    };

    const now = new Date();

    if (tbody) {
      tbody.innerHTML = data.logs.map(l => {
        const sentDate = new Date(l.sent_at);
        const followUpDate = l.follow_up_due ? new Date(l.follow_up_due) : null;
        const isOverdue = followUpDate && followUpDate < now && l.situation === 'Awaiting Reply';

        let followUpBadge = '<span class="text-secondary text-xs">—</span>';
        if (followUpDate) {
          if (isOverdue) {
            followUpBadge = `<span class="badge-overdue">⚠️ Due (${followUpDate.toLocaleDateString()})</span>`;
          } else {
            followUpBadge = `<span class="badge-upcoming">${followUpDate.toLocaleDateString()}</span>`;
          }
        }

        const marketFlag = l.country === 'UAE' ? '🇦🇪 Dubai' : '🇮🇳 ' + (l.city || 'India');

        return `
          <tr>
            <td>
              <strong>${escapeHtml(l.prospect_name)}</strong>
              <div class="text-secondary text-xs">${marketFlag}</div>
            </td>
            <td>
              <span class="stage-badge ready">${channelLabels[l.channel] || l.channel}</span>
            </td>
            <td>
              <code style="font-size:11px;">${escapeHtml(l.recipient_contact)}</code>
            </td>
            <td>
              <div style="cursor:pointer; color:#60a5fa;" onclick='viewOutreachMessage(${JSON.stringify(l).replace(/'/g, "&#39;")})' title="Click to view message body">
                <strong>${escapeHtml((l.subject || 'Outreach Note').slice(0, 30))}...</strong>
                <div class="text-secondary text-xs">${escapeHtml(l.message.slice(0, 40))}... 👁️</div>
              </div>
            </td>
            <td>
              <span class="text-xs">${sentDate.toLocaleDateString()}</span>
              <div class="text-dim text-xs">${sentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </td>
            <td>${followUpBadge}</td>
            <td>
              <select class="situation-select" onchange="updateOutreachSituation('${l.id}', this.value)">
                ${[
                  'Awaiting Reply',
                  'Follow-up Due',
                  'Responded - Interested',
                  'Meeting Scheduled',
                  'Proposal Sent',
                  'Won',
                  'Responded - Not Interested',
                  'Bounced'
                ].map(s => `<option value="${s}" ${l.situation === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </td>
            <td>
              <div class="flex gap-2">
                <button class="btn btn-sm btn-outline" onclick='viewOutreachMessage(${JSON.stringify(l).replace(/'/g, "&#39;")})' title="Read message">👁️ View</button>
                <button class="btn btn-sm btn-ghost" onclick="openOutreachForLead('${l.prospect_id}')" title="Pitch another channel">🚀 Pitch</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${err.message}</td></tr>`;
  }
}

function prevTrackerPage() {
  if (trackerPage > 0) { trackerPage--; fetchTracker(); }
}

function nextTrackerPage() {
  trackerPage++; fetchTracker();
}

async function updateOutreachSituation(logId, situation) {
  try {
    const res = await fetch(`/api/outreach/tracker/${logId}/situation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ situation })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    loadDashboard();
    fetchProspects();
  } catch (err) {
    alert(err.message);
  }
}

// -------------------------------------------------------------
// MESSAGE DETAIL VIEWER MODAL
// -------------------------------------------------------------
function viewOutreachMessage(item) {
  currentViewingMessage = item;
  document.getElementById('msg-modal-title').textContent = `${item.prospect_name} (${item.channel.toUpperCase()})`;
  document.getElementById('msg-modal-meta').textContent = `To: ${item.recipient_contact} • Sent: ${new Date(item.sent_at).toLocaleString()} • Current Situation: ${item.situation}`;

  const subjectBox = document.getElementById('msg-modal-subject-box');
  if (item.subject) {
    subjectBox.style.display = 'block';
    document.getElementById('msg-modal-subject').textContent = item.subject;
  } else {
    subjectBox.style.display = 'none';
  }

  document.getElementById('msg-modal-body').textContent = item.message;
  document.getElementById('msg-modal').style.display = 'flex';
}

function closeMessageModal() {
  document.getElementById('msg-modal').style.display = 'none';
}

function copyModalMessage() {
  if (!currentViewingMessage) return;
  const fullText = (currentViewingMessage.subject ? `Subject: ${currentViewingMessage.subject}\n\n` : '') + currentViewingMessage.message;
  navigator.clipboard.writeText(fullText).then(() => {
    alert('Message content copied to clipboard!');
  });
}

// -------------------------------------------------------------
// BATCH EMAIL AUTOMATION MODAL
// -------------------------------------------------------------
function openBatchAutomationModal() {
  document.getElementById('batch-modal').style.display = 'flex';
  document.getElementById('batch-progress-box').style.display = 'none';
  document.getElementById('batch-result-msg').innerHTML = '';
  document.getElementById('btn-start-batch').disabled = false;
  updateBatchEligibleCount();
}

async function updateBatchEligibleCount() {
  const country = document.getElementById('batch-market') ? document.getElementById('batch-market').value : 'all';
  const minScore = document.getElementById('batch-min-score') ? document.getElementById('batch-min-score').value : '50';
  const counter = document.getElementById('batch-eligible-count');
  if (!counter) return;

  try {
    const res = await fetch(`/api/outreach/eligible-count?country=${country}&minScore=${minScore}`);
    const data = await res.json();
    counter.textContent = `${data.count} lead(s) ready to email`;
    if (data.count === 0) {
      counter.className = 'text-warning';
    } else {
      counter.className = 'text-success';
    }
  } catch (e) {
    counter.textContent = 'Ready';
  }
}

function closeBatchAutomationModal() {
  document.getElementById('batch-modal').style.display = 'none';
}

async function executeBatchAutomation() {
  const country = document.getElementById('batch-market').value;
  const minScore = parseInt(document.getElementById('batch-min-score').value, 10);
  const limit = parseInt(document.getElementById('batch-limit').value, 10);
  const delaySeconds = parseInt(document.getElementById('batch-delay').value, 10) || 2;

  const btn = document.getElementById('btn-start-batch');
  btn.disabled = true;

  const progressBox = document.getElementById('batch-progress-box');
  const resultMsg = document.getElementById('batch-result-msg');
  const progressBar = document.getElementById('batch-progress-bar');
  const statusText = document.getElementById('batch-status-text');

  progressBox.style.display = 'block';
  statusText.textContent = `Dispatching cold emails (Throttling: ${delaySeconds}s)...`;
  progressBar.style.width = '50%';

  try {
    const res = await fetch('/api/outreach/batch-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, minScore, limit, delaySeconds })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    progressBar.style.width = '100%';
    statusText.textContent = 'Batch completed!';

    resultMsg.innerHTML = `
      <div class="p-3 mt-2" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16,185,129,0.3); border-radius:6px; color:#34d399;">
        <strong>✓ Batch Processed:</strong> ${data.sentCount} emails sent successfully. ${data.failedCount} skipped/failed.
        <br><span class="text-xs" style="color:var(--text-secondary);">All touchpoints have been logged to the Outreach Tracker with 3-day follow-up schedules.</span>
      </div>
    `;

    loadDashboard();
    fetchProspects();
    if (currentTab === 'tracker') fetchTracker();
  } catch (err) {
    resultMsg.innerHTML = `<div class="p-3 mt-2 text-danger" style="background:rgba(239,68,68,0.1); border-radius:6px;">Error: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
  }
}

// -------------------------------------------------------------
// SMTP SERVER SETTINGS HANDLERS
// -------------------------------------------------------------
async function loadSmtpSettings() {
  try {
    const res = await fetch('/api/settings/smtp');
    const data = await res.json();

    const hostInput = document.getElementById('smtp-host');
    const portInput = document.getElementById('smtp-port');
    const userInput = document.getElementById('smtp-user');
    const fromInput = document.getElementById('smtp-from');
    const secureSelect = document.getElementById('smtp-secure');
    const badge = document.getElementById('smtp-status-badge');

    if (hostInput && data.host) hostInput.value = data.host;
    if (portInput && data.port) portInput.value = data.port;
    if (userInput && data.user) userInput.value = data.user;
    if (fromInput && data.from) fromInput.value = data.from;
    if (secureSelect) secureSelect.value = String(Boolean(data.secure));

    if (badge) {
      if (data.isConfigured) {
        badge.className = 'stage-badge won';
        badge.textContent = `✓ SMTP Configured (${data.host})`;
      } else {
        badge.className = 'stage-badge ready';
        badge.textContent = 'Simulator Mode (Safe Local Tracking)';
      }
    }
  } catch (e) {
    console.error('Failed loading SMTP settings:', e);
  }
}

async function handleSaveSmtp(e) {
  e.preventDefault();
  const host = document.getElementById('smtp-host').value.trim();
  const port = document.getElementById('smtp-port').value.trim();
  const user = document.getElementById('smtp-user').value.trim();
  const pass = document.getElementById('smtp-pass').value;
  const from = document.getElementById('smtp-from').value.trim();
  const secure = document.getElementById('smtp-secure').value === 'true';

  try {
    const res = await fetch('/api/settings/smtp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, pass, from, secure })
    });
    const data = await res.json();
    alert('✓ SMTP Server Settings saved successfully!');
    loadSmtpSettings();
  } catch (err) {
    alert(`Failed saving SMTP settings: ${err.message}`);
  }
}

async function handleTestSmtp() {
  const host = document.getElementById('smtp-host').value.trim();
  const port = document.getElementById('smtp-port').value.trim();
  const user = document.getElementById('smtp-user').value.trim();
  const pass = document.getElementById('smtp-pass').value;
  const secure = document.getElementById('smtp-secure').value === 'true';

  if (!host || !user) {
    alert('Please enter SMTP Host and Username to test.');
    return;
  }

  alert('Initiating SMTP handshake verification test...');
  try {
    const res = await fetch('/api/settings/smtp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, pass, secure })
    });
    const data = await res.json();

    if (data.configured && data.status === 'Connected') {
      alert(`✓ Test Successful: ${data.message}`);
    } else {
      alert(`⚠️ Connection Result: ${data.status}\n${data.message}`);
    }
    loadSmtpSettings();
  } catch (err) {
    alert(`Test error: ${err.message}`);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// -------------------------------------------------------------
// AUTHENTICATION & SECURITY CONTROLS
// -------------------------------------------------------------
function showAuthModal(errMsg = '') {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'flex';
  const errBox = document.getElementById('auth-error');
  if (errBox) {
    if (errMsg) {
      errBox.textContent = errMsg;
      errBox.style.display = 'block';
    } else {
      errBox.style.display = 'none';
    }
  }
  const input = document.getElementById('auth-password-input');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
}

function hideAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.style.display = 'none';
  const errBox = document.getElementById('auth-error');
  if (errBox) errBox.style.display = 'none';
}

async function checkAuthOnLoad() {
  const token = localStorage.getItem('lm_auth_token');
  if (!token) {
    showAuthModal();
    return;
  }

  try {
    const res = await originalFetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      hideAuthModal();
      updateExportDownloadLinks();
      loadDashboard();
      fetchProspects();
      checkAdapterStatuses();
    } else {
      localStorage.removeItem('lm_auth_token');
      showAuthModal('Session expired. Please enter master password to unlock.');
    }
  } catch (err) {
    showAuthModal('Unable to verify security credentials. Please enter password.');
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('auth-password-input');
  const password = input ? input.value : '';
  const errBox = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit-btn');

  if (!password) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Verifying...</span>';
  }

  try {
    const res = await originalFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (res.ok && data.token) {
      localStorage.setItem('lm_auth_token', data.token);
      hideAuthModal();
      updateExportDownloadLinks();
      loadDashboard();
      fetchProspects();
      checkAdapterStatuses();
    } else {
      if (errBox) {
        errBox.textContent = data.error || 'Incorrect access password. Please try again.';
        errBox.style.display = 'block';
      }
      if (input) {
        input.select();
        input.focus();
      }
    }
  } catch (err) {
    if (errBox) {
      errBox.textContent = 'Connection error: ' + err.message;
      errBox.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>🔓 Unlock Command Center</span>';
    }
  }
}

function handleLogout() {
  if (confirm('Lock LucidMediax Command Center session now?')) {
    localStorage.removeItem('lm_auth_token');
    showAuthModal('Console locked. Enter master password to resume.');
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('current-pwd').value;
  const newPassword = document.getElementById('new-pwd').value;
  const confirmPassword = document.getElementById('confirm-pwd').value;
  const msgBox = document.getElementById('pwd-change-msg');
  const btn = document.getElementById('btn-update-pwd');

  if (newPassword !== confirmPassword) {
    msgBox.style.display = 'block';
    msgBox.className = 'text-xs mb-3 text-danger';
    msgBox.textContent = 'New passwords do not match.';
    return;
  }

  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      msgBox.style.display = 'block';
      msgBox.className = 'text-xs mb-3 text-success';
      msgBox.textContent = '✓ Master password changed successfully! Updating active session...';
      
      // Auto-relogin with new password to refresh session token
      const loginRes = await originalFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      const loginData = await loginRes.json();
      if (loginData.token) {
        localStorage.setItem('lm_auth_token', loginData.token);
        updateExportDownloadLinks();
      }
      document.getElementById('change-password-form').reset();
    } else {
      msgBox.style.display = 'block';
      msgBox.className = 'text-xs mb-3 text-danger';
      msgBox.textContent = `⚠️ Error: ${data.error || 'Failed to update password'}`;
    }
  } catch (err) {
    msgBox.style.display = 'block';
    msgBox.className = 'text-xs mb-3 text-danger';
    msgBox.textContent = `Error: ${err.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function updateExportDownloadLinks() {
  const token = localStorage.getItem('lm_auth_token') || '';
  document.querySelectorAll('a[href^="/api/export"], a[href^="/api/backup"]').forEach(a => {
    const rawUrl = a.getAttribute('data-raw-href') || a.getAttribute('href');
    a.setAttribute('data-raw-href', rawUrl);
    const cleanUrl = rawUrl.split('?')[0];
    const query = new URLSearchParams(rawUrl.includes('?') ? rawUrl.split('?')[1] : '');
    if (token) {
      query.set('auth_token', token);
    }
    a.setAttribute('href', `${cleanUrl}?${query.toString()}`);
  });
}
