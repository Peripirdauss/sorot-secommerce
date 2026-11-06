# Product Requirements Document (PRD) — TiktokSight

## 1. Summary
TiktokSight is a high-speed TikTok intelligence and video performance analytics tool for content creators, TikTok Shop affiliate marketers, and agency managers. It replaces slow, error-prone manual spreadsheet data entry with one-click batch scraping, instant engagement rate benchmarks, and clean Excel reporting. With TikTok becoming the primary product discovery and viral commerce engine, creators and agencies need immediate quantitative clarity on what formats convert and retain audiences.

## 2. Contacts
- **Product Manager**: Antigravity PM & Engineering
- **Engineering / Architecture Lead**: Antigravity Technical Lead
- **Product Owner**: User (@Peripirdauss)

## 3. Background
- **Context**: Social commerce and TikTok affiliate marketing have exploded, requiring creators and agencies to analyze dozens of competitor and campaign videos daily. Currently, users manually inspect TikTok views, likes, shares, comments, and saves, typing them row by row into Google Sheets or Excel.
- **Why Now?**: TikTok's organic reach algorithms reward specific engagement ratios (Save Rate, Share Rate, Comment Velocity). Existing enterprise social listening tools (Sprout Social, Brandwatch) cost $500–$1,500/month and lack granular TikTok video-level reverse engineering. TiktokSight fills the gap between free manual inspection and enterprise bloat with a lightweight, browser-based batch analyzer.

## 4. Objective
- **Core Objective**: Provide creators and marketing analysts with instantaneous, batch-audited TikTok video analytics and benchmark metrics that take under 10 seconds per batch.
- **Key Results (SMART OKRs)**:
  - **KR 1**: Reduce time-to-insight from 15 minutes per 10 videos (manual copy-paste) to under 20 seconds.
  - **KR 2**: Achieve a 95%+ scraping success rate on valid public TikTok video URLs without CAPTCHA stalls.
  - **KR 3**: 100% adherence to Hallmark Anti-Slop UI standards (sub-second UI feedback, 0 generic card nests, accessible tokens, zero fabricated stats).

## 5. Market Segment(s)
- **Segment A: TikTok Shop Affiliates & E-commerce Sellers**: Creators and sellers tracking top-performing affiliate video hooks, sound choices, and view-to-engagement metrics to replicate winning product showcases.
- **Segment B: Social Media Agency Managers & Media Buyers**: Analysts compiling campaign performance decks, tracking sponsored content (`isAD`) vs organic benchmarks, and delivering structured XLSX reports to clients.
- **Constraints**: Scraper depends on public TikTok SSR hydration payload access via Browserless. Private or region-locked video links require graceful fallback reporting.

## 6. Value Proposition(s) (6-Part JTBD Framework)

### For Segment A: TikTok Shop Affiliates
- **Who**: TikTok Shop affiliate creators and DTC marketers.
- **Why**: Trying to identify winning content hooks and analyze competitor performance metrics, but TikTok's native app only surfaces basic surface counts without calculated engagement ratios.
- **What before**: Manually clicking each video on mobile/desktop, writing down view/like/share counts in Excel, and manually calculating engagement rates.
- **How**: Paste 1 to 50 TikTok video URLs; TiktokSight extracts 20 critical metrics, computes Engagement Rate (ER%), Save-to-View ratio, and Sound retention metrics in seconds.
- **What after**: Immediate discovery of which hooks and audio tracks trigger viral save/share behaviour, cutting competitor research time by 80%.
- **Alternatives**: Native TikTok app (slow, no batch, no export), expensive SaaS tools like Kalodata/FastMoss (complex paid subscriptions).
- *Value Statement*: "TiktokSight gives affiliate creators instant quantitative clarity on competitor video performance in seconds, without expensive subscriptions."

### For Segment B: Social Media Agency Managers
- **Who**: Agency account managers and influencer marketing leads.
- **Why**: Need to verify sponsored video deliveries and report campaign metrics to brand clients accurately without spending hours consolidating spreadsheets.
- **What before**: Asking influencers for screenshots or manually copying statistics into client reporting decks.
- **How**: One-click bulk paste of campaign video links; system extracts verified creation dates, sound details, author metrics, and exports a professionally formatted XLSX sheet.
- **What after**: Instant, reproducible proof-of-performance reports delivered to clients within minutes of posting.
- **Alternatives**: Influencer marketing platforms ($1,000+/mo) or manual screenshot gathering.
- *Value Statement*: "TiktokSight automates influencer and campaign performance audits into client-ready Excel sheets in one click."

## 7. Solution

### 7.1 UX / UI Design Principles (Hallmark Anti-Slop Standard)
- **Design Tokens**: Strict `:root` design token architecture in `public/tokens.css` (OKLCH color system, typography scale, spacing variables).
- **Zero AI-Slop Floor**:
  - No purple-to-blue gradient clichés.
  - No nested cards or card-in-card containers.
  - No decorative status dots without semantic status.
  - No emoji as functional icons.
  - Explicit `:focus-visible` states with crisp keyboard navigation.
  - `overflow-x: clip` on `html` and `body`.
  - Hero headline under 7 words, 1 sentence under 12 words, visible above the fold on 1280x800 screens.
- **Signature Element**: **Interactive Engagement Radar & Benchmark Calculator** that flags whether a video's Save Rate (>3%) or Share Rate (>1%) indicates algorithmic virality.

### 7.2 Key Features (v1 Must-Haves)
1. **Batch URL Ingestion & Validator**: Clean, multiline input with real-time URL validation and duplicate removal.
2. **Robust Scraping Pipeline**: Optimized Browserless connection with proper timeout management, stealth headers, and JSON extractor.
3. **Smart Analytics Engine**:
   - Engagement Rate: `((Likes + Comments + Shares + Saves) / Views) * 100`
   - Virality Index (Save-to-View & Share-to-View ratios)
   - Account Velocity: Video count, followers, total heart count.
4. **Data Presentation**:
   - Clean tabular view with sticky headers, monospaced tabular figures, and sortable columns.
   - Expandable inspector drawer for granular metadata (Music ID, create time, isAD, sound).
5. **One-Click Client Export**: Formatted `.xlsx` export with calculated columns and professional column headers.
6. **Local Development Fix**: Robust `req.on('data')` stream parser in `index.js` to ensure seamless local operation alongside Vercel serverless.

### 7.3 Technology
- Runtime: Node.js 18.x
- Backend: Puppeteer with Browserless.io remote headless browser
- Frontend: Semantic HTML5, CSS tokens (OKLCH modern-minimal design register), SheetJS (XLSX)
- Hosting: Vercel serverless functions

### 7.4 Assumptions & Open Questions
- *Assumption 1*: TikTok's SSR payload structure (`__DEFAULT_SCOPE__`) remains stable in public desktop responses.
- *Assumption 2*: Free/starter Browserless concurrency allows 2-5 concurrent sessions per batch without rate-limiting.
- *Open Question 1*: Should we support TikTok profile URLs (e.g. `@username`) to auto-scrape the last 10 videos in v2?

## 8. Release Plan

### Version 1.0 (Current Sprint)
- Fix local server `index.js` POST body parser.
- Implement Hallmark anti-slop design system (`tokens.css`, clean technical register, keycap buttons, zero slop).
- Add calculated Engagement Rate (ER%), Save-to-View ratio, and Virality Benchmark signals.
- Secure `.env` and `.gitignore`.

### Version 2.0 (Later)
- Profile scraping (input `@username` to pull latest 12 videos).
- CSV/JSON raw webhook export.
- Historical trend comparison across scrapes.

### Explicit Non-Goals (v1)
- Video media downloading (MP4 watermarked/unwatermarked storage).
- User authentication and multi-tenant database (keeping it lightweight, stateless, and client-local).
- Paid proxy rotation networks (Browserless manages proxying).

