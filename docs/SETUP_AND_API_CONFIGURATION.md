# Setup & API Configuration Guide

This guide walks you through configuring **LucidMediax Growth Intelligence** for zero-cost local prospecting or optional cloud/enrichment API scaling.

---

## 1. Quick Start (No Paid APIs Required)

By default, the platform runs out of the box using:
1. **Local Go Scraper Engine**: Built from `gosom/google-maps-scraper` (Free, no keys needed).
2. **Direct Web & DNS MX Auditor**: Node.js zero-cost website and email discovery.
3. **Local SQLite Database**: Zero database hosting fees.

To start:
```bash
cd "/Users/asheshthakur/Documents/Google Scrapper/lucidmediax-prospecting"
cp .env.example .env
npm start
```
Visit: **http://localhost:3500**

---

## 2. Environment Variables Configuration

Copy `.env.example` to `.env`:

```bash
PORT=3500
NODE_ENV=development

# --- Local Go Scraper Binary ---
LOCAL_SCRAPER_PATH="/Users/asheshthakur/Documents/Google Scrapper/google-maps-scraper/google-maps-scraper"

# --- Optional Apify Integration ---
# Free $5/mo credits available on Apify.
APIFY_TOKEN=""

# --- Optional Google PageSpeed Insights ---
# Obtain from Google Cloud Console (25,000 free requests/day).
PAGESPEED_API_KEY=""

# --- Optional Hunter.io B2B Email Finder ---
# 25 free searches/month.
HUNTER_API_KEY=""

# --- Target Agency Brand Configuration ---
AGENCY_NAME="LucidMediax"
AGENCY_EMAIL="contact@lucidmediax.com"
AGENCY_PHONE="+971 50 000 0000"
AGENCY_WEBSITE="https://lucidmediax.com"
```

---

## 3. Testing Provider Connections

In the **Settings** view of the application, click **"Test Connection"** on any provider adapter to verify connectivity, latency, and authentication status in real-time.
