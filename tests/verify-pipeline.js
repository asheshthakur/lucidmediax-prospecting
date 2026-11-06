const assert = require('assert');
const { computeDedupHash, evaluateProspect } = require('../server/services/intelligence-scorer');
const { generateOutreachSuite } = require('../server/services/outreach-generator');

console.log('--- RUNNING SUITE 1: Deduplication Hash Verification ---');
const leadA = {
  business_name: 'District Real Estate',
  phone: '048800373',
  website: 'https://www.districtuae.com/'
};
const leadB = {
  business_name: 'district real estate',
  phone: '+971-4-880-0373',
  website: 'http://districtuae.com'
};

const hashA = computeDedupHash(leadA);
const hashB = computeDedupHash(leadB);
assert.strictEqual(hashA, hashB, 'Deduplication hashes for identical business variations must match');
console.log('✓ SHA-256 Deduplication test passed:', hashA);

console.log('\n--- RUNNING SUITE 2: Opportunity & Lead Scoring Verification ---');
const prospectDubai = {
  business_name: 'Luxury Bay Properties',
  country: 'UAE',
  city: 'Dubai',
  category: 'Real Estate Agency',
  phone: '+971501234567',
  website: 'https://luxurybay.ae',
  rating: 4.8,
  review_count: 55
};

// Simulate weak on-page SEO audit
const auditFindings = {
  websiteHasSsl: 1,
  hasMetaDescription: false,
  websiteSpeedScore: 48
};

const evalDubai = evaluateProspect(prospectDubai, auditFindings);
assert(evalDubai.opportunityScore >= 70, 'High intent niche with SEO weaknesses must score ≥ 70');
assert(evalDubai.identifiedProblems.length > 0, 'Must record specific observed weaknesses');
console.log(`✓ Scoring test passed: Opportunity Score ${evalDubai.opportunityScore}/100 [Tier: ${evalDubai.priorityTier}]`);
console.log('  Observed Problems:', evalDubai.identifiedProblems);
console.log('  Recommended Services:', evalDubai.recommendedServices);

console.log('\n--- RUNNING SUITE 3: Personalized Outreach Generation ---');
const outreach = generateOutreachSuite({
  ...prospectDubai,
  identified_problems: evalDubai.identifiedProblems,
  recommended_services: evalDubai.recommendedServices
});

assert(outreach.coldEmail.body.includes('Dubai'), 'Email body must localize to target city/country');
assert(outreach.whatsapp.body.includes('Luxury Bay Properties'), 'WhatsApp note must include business name');
assert(outreach.arabicDubai.body.includes('لوسيد ميدياكس'), 'Arabic template must retain LucidMediax branding');
console.log('✓ Cold Email Subject:', outreach.coldEmail.subject);
console.log('✓ Outreach Suite generation passed');

console.log('\n=========================================');
console.log('ALL CORE INTELLIGENCE TESTS PASSED (3/3)');
console.log('=========================================');
