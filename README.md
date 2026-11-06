# LucidMediax Growth Intelligence
## B2B Prospecting, Lead Intelligence & Client Acquisition Engine

A dedicated sales intelligence and client acquisition platform built for **LucidMediax** to acquire paying digital marketing clients across **Dubai (UAE)** and **India**.

---

## 🚀 Quick Launch

The application runs locally on zero-cost infrastructure:

```bash
cd "/Users/asheshthakur/Documents/Google Scrapper/lucidmediax-prospecting"
npm start
```

Open your browser to:
**http://localhost:3500**

To run automated test suites:
```bash
npm test
```

---

## 🎯 Target Markets & Segments

### Market 1: Dubai, UAE
- **Key Micro-Markets:** Business Bay, Dubai Marina, Downtown Dubai, JLT, JVC, DIFC, Deira, Bur Dubai, Al Barsha.
- **Priority Niches:** Real Estate Agencies & Property Brokers, Dental & Healthcare Clinics, Aesthetic & Beauty Centers, Restaurants & Hospitality, Gyms & Fitness Centers.

### Market 2: India
- **Key Cities:** Delhi NCR (Gurugram, Noida, South Delhi), Mumbai (Bandra, Andheri), Bengaluru (Indiranagar, Koramangala), Hyderabad, Pune, Kolkata, Chennai, Ahmedabad, Patna, Bokaro, Ranchi.
- **Priority Niches:** Real Estate, Hospitals & Dental Clinics, Coaching Institutes, D2C & Retail Brands, Professional Services.

---

## 🛠️ System Architecture

```
lucidmediax-prospecting/
├── docs/
│   ├── API_SOURCE_EVALUATION.md       # Full evaluation of upstream 4,431+ catalogue
│   └── SETUP_AND_API_CONFIGURATION.md # Environment & setup reference
├── server/
│   ├── adapters/
│   │   ├── local-engine-adapter.js     # Primary: Zero-cost Go Google Maps Scraper
│   │   ├── apify-adapter.js            # Optional: Cloud Actor connector
│   │   └── pagespeed-adapter.js        # Optional: Google PageSpeed API connector
│   ├── services/
│   │   ├── intelligence-scorer.js      # 0-100 scoring & SHA-256 deduplication
│   │   ├── website-auditor.js          # Direct SSL, DNS MX & HTML email/social scraper
│   │   └── outreach-generator.js       # Observation-led personalized pitch generator
│   ├── db.js                           # SQLite WAL database & schema
│   └── index.js                        # Express REST API & export engine
├── public/
│   ├── index.html                      # Premium SaaS workspace UI
│   ├── style.css                       # Design system
│   └── app.js                          # Client-side state & channel switcher
├── tests/
│   └── verify-pipeline.js              # Verification test suite
├── .env.example
├── package.json
└── README.md
```

---

## 🔍 How to Execute Your First Searches

### 1. Ingest Pre-existing Verified Leads
Click **"⚡ Ingest Verified Datasets"** in the top bar to load 179+ pre-verified real businesses across Dubai (Business Bay real estate) and India (Patna, Bokaro, Ranchi healthcare).

### 2. Run a Live Dubai Search
1. Open **"Discover Leads"**.
2. Select **Target Market: Dubai, UAE**.
3. Choose **Commercial Area: Business Bay** (or Dubai Marina, Downtown).
4. Select **Industry: Real Estate Agencies**.
5. Click **"🚀 Launch Prospect Discovery"**.
6. The local engine extracts listings, phone numbers, websites, and review metrics, scores each prospect, and updates the CRM.

### 3. Review & Pitch with Outreach Studio
1. Navigate to **"Outreach Studio"**.
2. Select any high-priority prospect.
3. Switch between **Cold Email**, **WhatsApp**, **Instagram DM**, **LinkedIn**, or **Follow-up**.
4. The pitch references the prospect's actual observed digital weakness (e.g. missing meta tags, low review volume, or lack of social presence).
5. Click **"Copy to Clipboard"** or use the direct **"Open WhatsApp"** / **"Open Email App"** action links to reach out.
