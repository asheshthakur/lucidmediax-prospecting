const crypto = require('crypto');

/**
 * Computes a deterministic deduplication hash for a business prospect
 * Combines normalized title + domain (if present) or phone (if present) or clean address
 */
function computeDedupHash(lead) {
  const normTitle = (lead.business_name || lead.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  let normPhone = (lead.phone || '').replace(/[^0-9]/g, '');
  if (normPhone.length > 10) normPhone = normPhone.slice(-10);

  let normDomain = '';
  const website = lead.website || lead.web_site || '';
  if (website) {
    try {
      const url = new URL(website.startsWith('http') ? website : `https://${website}`);
      normDomain = url.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      normDomain = website.toLowerCase().replace(/[^a-z0-9.]/g, '');
    }
  }

  const normAddress = (lead.address || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);

  const key = `${normTitle}|${normDomain || normPhone || normAddress}`;
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Intelligent Opportunity & Quality Scorer for LucidMediax
 * Determines how much a company needs digital marketing services (0-100)
 */
function evaluateProspect(prospect, audit = {}) {
  let opportunityScore = 0;
  let confidenceScore = 0;
  const reasons = [];
  const identifiedProblems = [];
  const recommendedServices = [];

  const targetIndustries = [
    'real estate', 'realtor', 'property',
    'dental', 'clinic', 'aesthetic', 'beauty', 'salon', 'spa',
    'restaurant', 'cafe', 'hospitality',
    'fitness', 'gym',
    'recruitment', 'staffing',
    'coaching', 'education',
    'ecommerce', 'd2c', 'retail', 'consulting'
  ];

  const categoryLower = (prospect.category || '').toLowerCase();
  const nameLower = (prospect.business_name || '').toLowerCase();
  const isTargetIndustry = targetIndustries.some(t => categoryLower.includes(t) || nameLower.includes(t));

  // Factor 1: Industry Fit (Weight: 20)
  if (isTargetIndustry) {
    opportunityScore += 20;
    reasons.push('High-growth commercial niche with high customer lifetime value');
  } else {
    opportunityScore += 10;
  }

  // Factor 2: Website & SEO Weaknesses (Weight: 30)
  const hasWebsite = Boolean(prospect.website && prospect.website.trim().length > 5);
  if (!hasWebsite) {
    opportunityScore += 25;
    identifiedProblems.push('Missing official business website');
    recommendedServices.push('Website and Digital Presence Audits');
    reasons.push('No website detected: critical need for an online presence and conversion funnel');
  } else {
    confidenceScore += 30;
    // Website exists: analyze technical health
    if (audit.websiteHasSsl === 0) {
      opportunityScore += 10;
      identifiedProblems.push('Insecure connection (Missing HTTPS/SSL)');
      recommendedServices.push('Website and Digital Presence Audits');
      reasons.push('Website lacks modern SSL security, damaging visitor trust and Google rankings');
    }

    if (!audit.hasMetaDescription) {
      opportunityScore += 10;
      identifiedProblems.push('Poor On-Page SEO (Missing meta description tags)');
      recommendedServices.push('Search Engine Optimisation (SEO)');
      recommendedServices.push('Keyword Research and Competitor Analysis');
      reasons.push('Unoptimised meta tags: losing organic search traffic to competitors');
    }

    if (audit.websiteSpeedScore && audit.websiteSpeedScore < 60) {
      opportunityScore += 8;
      identifiedProblems.push('Slow page load speed');
      recommendedServices.push('Website and Digital Presence Audits');
    }
  }

  // Factor 3: Social Media Presence & Opportunity (Weight: 15)
  const hasInstagram = Boolean(prospect.instagram_url);
  const hasFacebook = Boolean(prospect.facebook_url);
  const hasLinkedin = Boolean(prospect.linkedin_url);

  if (!hasInstagram && !hasFacebook && !hasLinkedin) {
    opportunityScore += 15;
    identifiedProblems.push('No linked active social media channels');
    recommendedServices.push('Social Media Marketing and Management');
    recommendedServices.push('Social Media Content Creation');
    reasons.push('Zero visible presence on social channels: huge untapped local audience');
  } else if (!hasInstagram) {
    opportunityScore += 10;
    identifiedProblems.push('Missing Instagram channel');
    recommendedServices.push('Social Media Content Creation');
    recommendedServices.push('Meta Advertising (Facebook and Instagram)');
    reasons.push('Active on web/LinkedIn but missing Instagram visual storytelling & reels');
  } else if (!hasLinkedin) {
    opportunityScore += 8;
    identifiedProblems.push('Missing LinkedIn Company Page');
    recommendedServices.push('Brand Management and Positioning');
    reasons.push('Missing executive LinkedIn presence to capture high-net-worth commercial clients');
  } else {
    confidenceScore += 20;
  }

  // Factor 4: Business Activity, Reviews & Local SEO (Weight: 10)
  const reviewCount = Number(prospect.review_count) || 0;
  const rating = Number(prospect.rating) || 0;

  if (reviewCount < 15) {
    opportunityScore += 10;
    identifiedProblems.push('Low review volume on Google Business Profile');
    recommendedServices.push('Website and Digital Presence Audits');
    reasons.push('Under 15 Google reviews: needs local reputation building and customer feedback workflows');
  } else if (rating > 4.2 && reviewCount >= 30) {
    // Good business with existing traction: prime candidate for performance ads
    opportunityScore += 8;
    recommendedServices.push('Meta Advertising (Facebook and Instagram)');
    recommendedServices.push('Performance Marketing and Campaign Management');
    reasons.push('Strong positive customer ratings: ideal foundation to scale paid lead-generation campaigns');
    confidenceScore += 15;
  }

  // Factor 5: Legitimate Contactability (Weight: 15)
  const hasPhone = Boolean(prospect.phone && prospect.phone.trim().length > 5);
  const hasEmail = Boolean(prospect.email && prospect.email.includes('@'));

  if (hasEmail) {
    opportunityScore += 10;
    confidenceScore += 20;
  }
  if (hasPhone) {
    opportunityScore += 5;
    confidenceScore += 15;
  }

  // Factor 6: Market Priority (Weight: 10)
  const country = (prospect.country || '').toUpperCase();
  if (country === 'UAE' || country === 'DUBAI') {
    opportunityScore += 10; // Prime high-margin retainer market
  } else {
    opportunityScore += 8; // High volume growth market
  }

  // Normalize scores
  opportunityScore = Math.min(100, Math.max(10, opportunityScore));
  confidenceScore = Math.min(100, Math.max(10, confidenceScore));

  // Determine Priority Tier
  let priorityTier = 'Low';
  if (opportunityScore >= 85) priorityTier = 'Excellent';
  else if (opportunityScore >= 70) priorityTier = 'High';
  else if (opportunityScore >= 50) priorityTier = 'Potential';

  // Fallback defaults for services if none identified
  if (recommendedServices.length === 0) {
    recommendedServices.push('Marketing Strategy and Growth Consulting');
    recommendedServices.push('Social Media Marketing and Management');
  }

  // Pick top 2 unique services
  const topServices = Array.from(new Set(recommendedServices)).slice(0, 2);

  // Executive briefing synthesis
  const problemSummary = identifiedProblems.slice(0, 2).join(' and ') || 'room for stronger conversion';
  const brief = `${prospect.business_name} in ${prospect.city || 'target market'} represents an ${priorityTier.toLowerCase()}-tier opportunity with ${problemSummary}. Recommend pitching ${topServices.join(' & ')} to drive predictable customer acquisition.`;

  return {
    opportunityScore,
    confidenceScore,
    priorityTier,
    identifiedProblems: Array.from(new Set(identifiedProblems)),
    recommendedServices: topServices,
    reasons,
    executiveBrief: brief
  };
}

module.exports = {
  computeDedupHash,
  evaluateProspect
};
