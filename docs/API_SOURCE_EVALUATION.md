# API Source Evaluation & Practical Integration Audit

This document evaluates the API providers catalogued in `apis-that-find-your-next-clients` for **LucidMediax**'s client acquisition operations across **Dubai, UAE** and **India**.

---

## 1. Executive Summary & Selection Strategy

The upstream catalogue contains **4,431+ endpoints and actors**, primarily hosted on Apify, RapidAPI, and proprietary SaaS platforms. 

For LucidMediax, our client acquisition objective requires:
1. **Real local business discovery** in target micro-markets (Business Bay, Dubai Marina, Downtown Dubai, JLT, Delhi NCR, Mumbai, Bengaluru, etc.).
2. **Zero mandatory paid API overhead** initially, ensuring client acquisition can begin without burning ad/infrastructure budgets.
3. **Pluggable adapter architecture** with graceful fallback to local Playwright/HTTP scraping and zero-cost web/DNS discovery.
4. **Transparent integration status**: no synthetic promises—if a provider needs an API key or paid token, its adapter is implemented, testable, and clearly reports its configuration status.

---

## 2. Selected Practical Providers

| Provider / Source | Primary Capability | Regional Coverage | Cost Model | Current Status in LucidMediax Engine |
| :--- | :--- | :--- | :--- | :--- |
| **Local Go / Playwright G-Maps Engine** | High-speed local business discovery, geo coordinates, phone, reviews, website | Global (Dubai & India fully verified) | **100% Free** (No API keys needed, local execution) | **ACTIVE & PRIMARY** |
| **Apify Google Maps Scrapers** (`khadinakbar` / `compass`) | Cloud-scale batch lead generation with reviews & contact enrichment | Global | Free tier ($5/mo credits) + Pay-as-you-go | **ADAPTER READY** (Token configured via `.env`) |
| **Direct Web Discovery & DNS MX Resolver** | Live website HTML audit, contact email extraction, social links, DNS MX validity | Global | **100% Free & Unlimited** | **ACTIVE & PRIMARY** |
| **Google PageSpeed Insights API** | Technical web performance, mobile responsiveness, Core Web Vitals | Global | Free tier (25,000 requests/day free with Google Cloud key) | **ADAPTER READY** (Optional key in `.env`) |
| **Hunter.io / Apollo.io B2B Enrichment** | Professional decision-maker lookup, executive emails | Global | Free monthly tier (25-50 requests) | **ADAPTER READY** (Optional key in `.env`) |

---

## 3. Detailed Provider Breakdown

### A. Local High-Speed G-Maps Discovery (`local-engine`)
- **Category:** `local-maps-leads`
- **Authentication:** None. Local Go binary executes via Playwright / HTTP search emulators.
- **Coverage:** Exceptional for Dubai (Business Bay, Marina, JLT, Downtown, Deira, Bur Dubai) and India (Delhi, Mumbai, Bengaluru, Patna, Bokaro, etc.).
- **Data Points:** Business Name, Category, Physical Address, Phone, Website, Star Rating, Review Count, Coordinates, Opening Hours.
- **Usage Recommendation:** Default primary discovery source for all daily prospecting searches.

### B. Direct Web & SEO Opportunity Auditor (`direct-web`)
- **Category:** `website-audit` + `email-contact-finders`
- **Authentication:** None. Employs Node.js standard HTTPS/HTTP with custom User-Agent, followed by DNS MX resolution via `dns.promises`.
- **Coverage:** Worldwide.
- **Data Points:** Website responsiveness, SSL/HTTPS status, Title tags, Meta descriptions, Contact emails, Social profile handles (Instagram, Facebook, LinkedIn, Twitter/X).
- **Usage Recommendation:** Runs automatically on every discovered lead to identify digital marketing weaknesses and service recommendations for LucidMediax.

### C. Apify Actor Cloud Connector (`apify-gmaps`)
- **Category:** `local-maps-leads`
- **Authentication:** `APIFY_TOKEN` (configured in `.env`).
- **Actors Tested:** `khadinakbar/google-maps-leads-scraper`, `compass/crawler-google-places`.
- **Usage Recommendation:** Used when headless cloud crawling is preferred over local machine bandwidth.

### D. Google PageSpeed Insights Connector (`pagespeed-api`)
- **Category:** `website-audit`
- **Authentication:** `PAGESPEED_API_KEY` (optional; falls back to direct HTTP latency and mobile viewport checks).
- **Pricing:** Free quota of 25,000 queries per day.
- **Data Points:** Mobile performance score, accessibility score, SEO score, Largest Contentful Paint (LCP).

---

## 4. Compliance and Terms of Service Notice

- All scraping and discovery operations collect **publicly available business contact information** intended for commercial communication.
- No personal consumer data or private behind-login data (e.g. personal LinkedIn accounts) is collected.
- LucidMediax adheres to electronic marketing guidelines: suppression lists, opt-out mechanisms, and manual review of all outbound communications prior to sending.
