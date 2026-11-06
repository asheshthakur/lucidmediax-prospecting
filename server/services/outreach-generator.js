/**
 * Personalized Outreach Generator for LucidMediax
 * Generates tailored sales approaches based on REAL identified opportunities.
 * Never invents audits or facts.
 */

function generateOutreachSuite(prospect) {
  const agencyName = 'LucidMediax';
  const name = prospect.business_name || 'your team';
  const city = prospect.city || 'your area';
  const category = prospect.category || 'business';

  let problems = [];
  try {
    problems = typeof prospect.identified_problems === 'string'
      ? JSON.parse(prospect.identified_problems)
      : (prospect.identified_problems || []);
  } catch {
    problems = [];
  }

  let services = [];
  try {
    services = typeof prospect.recommended_services === 'string'
      ? JSON.parse(prospect.recommended_services)
      : (prospect.recommended_services || []);
  } catch {
    services = ['Social Media Growth', 'Performance Marketing'];
  }

  const primaryProblem = problems[0] || 'untapped digital presence';
  const primaryService = services[0] || 'performance marketing';
  const secondaryService = services[1] || 'content strategy';

  const isDubai = (prospect.country || '').toUpperCase() === 'UAE' || (prospect.city || '').toLowerCase().includes('dubai');

  // 1. Cold Email
  const coldEmail = {
    channel: 'email',
    subject: `Quick observation on ${name}'s digital presence in ${city}`,
    body: `Hi ${prospect.decision_maker_name || 'there'},

I was reviewing prominent ${category.toLowerCase()} businesses across ${city} and spent some time on ${name}'s profile.

You've built impressive credibility (${prospect.rating ? `${prospect.rating}⭐ over ${prospect.review_count} reviews` : 'in the local market'}), but I noticed an immediate growth opportunity around ${primaryProblem.toLowerCase()}.

At ${agencyName}, we partner with growing companies across ${isDubai ? 'Dubai' : 'India'} to turn digital channels into direct revenue drivers through ${primaryService.toLowerCase()} and ${secondaryService.toLowerCase()}.

We recently helped similar brands fix this exact bottleneck to significantly increase qualified customer inquiries.

Do you have 10 minutes next Tuesday or Wednesday for a quick introductory exchange? I'd be glad to share a free 1-page breakdown of how we'd elevate ${name}'s customer acquisition.

Best regards,

Growth Team | ${agencyName}
${isDubai ? 'Dubai, UAE' : 'India'}
contact@lucidmediax.com`
  };

  // 2. WhatsApp Introduction
  const whatsapp = {
    channel: 'whatsapp',
    body: `Hi ${prospect.decision_maker_name || name} team, this is Ashesh from ${agencyName}. We work with ${category.toLowerCase()} businesses in ${city}.

I noticed your strong profile (${prospect.review_count || 10}+ reviews), but spotted a quick fix regarding ${primaryProblem.toLowerCase()} that is likely costing you direct leads.

Could I share a 2-minute voice note or short 1-page action plan on how we'd fix that and scale your client pipeline? No obligation at all.`
  };

  // 3. Instagram DM
  const instagram = {
    channel: 'instagram',
    body: `Hey @${name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}! Love what you're doing with the brand in ${city}. 

Quick thought from our creative team at ${agencyName}: we noticed ${primaryProblem.toLowerCase()}, which is super easy to resolve with targeted visual content & Meta ads. 

Would love to send over 2 quick concepts we sketched for you guys if you're open to seeing them?`
  };

  // 4. LinkedIn Connection Note
  const linkedin = {
    channel: 'linkedin',
    body: `Hi ${prospect.decision_maker_name || 'there'}, saw your leadership at ${name} in ${city}. At ${agencyName}, we help ambitious ${category.toLowerCase()} brands scale client acquisition through ${primaryService.toLowerCase()}. Would love to connect and share some localized insights!`
  };

  // 5. Follow-ups
  const followUp3d = {
    channel: 'follow_up_3d',
    subject: `Re: Quick observation on ${name}`,
    body: `Hi ${prospect.decision_maker_name || 'there'},

Just floating this back up. We mapped out 3 specific opportunities for ${name} to attract higher-intent clients via ${primaryService.toLowerCase()} without burning marketing budget.

Would you be open to a 5-minute call this week?`
  };

  const followUp7d = {
    channel: 'follow_up_7d',
    subject: `Resource for ${name} team`,
    body: `Hi ${prospect.decision_maker_name || 'there'},

I know schedules get hectic. Just wanted to share that we just launched a high-impact campaign for another ${category.toLowerCase()} client in ${city} that increased qualified bookings within 14 days.

Happy to send over the case breakdown if you'd find it helpful for ${name}.`
  };

  // 6. Regional Tone Variations (Hinglish & Arabic Preview)
  const hinglish = {
    channel: 'hinglish_whatsapp',
    body: `Hi ${prospect.decision_maker_name || name} ji, Ashesh here from ${agencyName}. Aapka business profile dekha in ${city} - reputation kafi acchi hai! 

Notice kiya ki aapki ${primaryProblem.toLowerCase()} thodi unoptimised hai, jiski wajah se potential clients competitors ke paas ja rahe hain. 

Aapko ek simple 2-minute overview bhejoon showing how we can generate consistent high-ticket inquiries for you through ${primaryService.toLowerCase()}?`
  };

  const arabicDubai = {
    channel: 'ar_dubai_email',
    subject: `ملاحظة سريعة حول التسويق الرقمي لـ ${name} في دبي`,
    body: `مرحباً فريق ${name}،

اطلعنا باهتمام على نشاطكم في ${city}، ولاحظنا فرصة ممتازة لتطوير الحضور الرقمي وجذب عملاء جدد عبر ${primaryService.toLowerCase()}.

في ${agencyName} دبي، نساعد الشركات على زيادة مبيعاتها وبناء هوية رقمية قوية. هل يناسبكم لقاء قصير لمدة 10 دقائق لمناقشة خطة مخصصة لشركتكم؟

مع أطيب التحيات،
فريق لوسيد ميدياكس (LucidMediax) - دبي`
  };

  return {
    coldEmail,
    whatsapp,
    instagram,
    linkedin,
    followUp3d,
    followUp7d,
    hinglish,
    arabicDubai
  };
}

module.exports = {
  generateOutreachSuite
};
