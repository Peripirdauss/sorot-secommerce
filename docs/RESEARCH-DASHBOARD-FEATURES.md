# Market & Feature Research: TikTok Intelligence & Analytics Dashboards

## 1. Executive Summary & Market Context
TikTok's recommendation engine has completely decoupled content reach from follower count. As a result, traditional social analytics (which rely on "Engagement by Followers") produce distorted, misleading data for creators, TikTok Shop affiliates, and agency media buyers.

Current market solutions fall into two polarized extremes:
1. **Heavy E-commerce Platforms (Kalodata, FastMoss)**: Hyper-focused on TikTok Shop GMV and livestreams, with complex pricing ($100–$300+/mo) and cluttered interfaces.
2. **Enterprise Social Listening (Exolyt, Pentos, Sprout Social)**: Built for Fortune 500 brand sentiment tracking ($500–$1,500/mo), with long onboarding and heavy contracts.

**TiktokSight's Competitive Opportunity**: A lightweight, instantaneous, anti-slop intelligence workbench that allows creators, media buyers, and agencies to audit public TikTok videos in seconds, dissecting the true algorithmic drivers of virality (**Intent Ratios: Save Rate & Share Rate**) without friction.

---

## 2. Competitive Landscape Teardown

| Competitor | Primary Focus | Pricing Tier | Core Strengths | Critical Gaps & Weaknesses |
| :--- | :--- | :--- | :--- | :--- |
| **Kalodata** | TikTok Shop e-commerce & affiliates | $99 – $300+/mo | Daily GMV estimates, top-selling products, livestream tracking | Overwhelming UI, slow data loads, expensive for individual creators |
| **FastMoss** | Creator database & shop ad spy | $89 – $299+/mo | Massive creator discovery engine, contact extraction limits | Cluttered navigation, aggressive paywalls on deep video metrics |
| **Exolyt** | Brand listening & organic monitoring | $350 – $800+/mo | Clean reporting, sentiment analysis, client-ready decks | Geared for enterprise; lacks rapid single/batch video hook reverse-engineering |
| **Pentos** | Campaign measurement & API | $150 – $500+/mo | Profile development, hashtag tracking over time | No direct ad vs organic breakdown for quick affiliate hook research |
| **Countik / Social Blade** | Basic vanity metrics | Free / Freemium | Instant profile lookups, follower counters | Zero engagement ratio breakdown; no saves/shares intent analysis |

### Unmet Market Needs
- **Zero-Friction Batch Ingestion**: Pasting 10–50 video links and getting instant, normalized metrics without creating accounts or waiting for long syncs.
- **Intent-Based Virality Diagnostics**: Classifying videos by algorithmic behavior (e.g. *Save-Heavy Evergreen* vs *Share-Heavy Viral Loop* vs *Passive Fluff*).
- **Head-to-Head Creative Hook Comparison**: Comparing two similar videos side-by-side to see why one achieved 1M views while the other stalled at 10K.
- **Audio / Sound Reuse ROI**: Quickly identifying if a video's success was powered by an organic viral audio or pure content hook.

---

## 3. High-Value Feature Discovery & RICE Prioritization

Using the PM prioritization framework from `pm-skills`, we evaluate 6 potential dashboard features across **Reach, Impact, Confidence, and Effort (RICE)**:

| Feature Concept | Description & Problem Solved | Reach (1-10) | Impact (1-5) | Confidence (%) | Effort (1-5) | RICE Score | Tier |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Intent Archetype Matrix (Virality Diagnostics)** | Automatically classifies each video into 4 archetypes based on Save & Share rates: *Viral Loop* (High S/Sh), *Evergreen Reference* (High Save, Low Share), *Passive Fluff* (High Likes, Low S/Sh), and *Underperforming*. | 10 | 4.5 | 95% | 1.5 | **285** | **P0 (Must-Have)** |
| **2. Head-to-Head Video Battle (A/B Hook Compare)** | Select any 2 videos from the audited batch to see a side-by-side delta on ER%, Save Rate, duration, and author velocity to dissect winning hooks. | 8 | 4.0 | 90% | 2.0 | **144** | **P0 (Must-Have)** |
| **3. Audio/Sound Performance Cluster** | Groups batch videos by `musicId` and displays average views, saves, and engagement per audio track. | 7 | 3.5 | 85% | 2.0 | **104** | **P1 (High)** |
| **4. Sponsored (`isAD`) vs Organic Comparative Split** | One-click filter and banner breakdown comparing performance of commercial ads versus organic creative posts in the batch. | 8 | 3.0 | 90% | 1.0 | **216** | **P0 (Must-Have)** |
| **5. Advanced Batch Filter & Quick Sorter** | Instant sorting by Views, Likes, ER%, Save Rate, and Virality Tier without re-scraping. | 9 | 3.5 | 95% | 1.0 | **299** | **P0 (Must-Have)** |
| **6. Profile Rapid Pull (@username)** | Ingesting a creator's `@handle` and automatically populating the last 12 video URLs for batch audit. | 9 | 4.0 | 80% | 3.5 | **82** | **P2 (Later)** |

---

## 4. Proposed Dashboard Architecture & UX (Hallmark Aligned)

### A. Layout Structure (Workbench / Feature Ledger)
- **Top Ledger (Global Batch Signal)**:
  - Total Audited Videos
  - Aggregate Views & Velocity
  - Mean Engagement Rate (ER% by Views)
  - Organic vs Sponsored Share (`isAD` ratio)
- **Left Column: Action & Diagnostics Panel**:
  - Multiline URL Ingestion with sample demo loader (for instant testing without waiting)
  - **Live Virality Benchmark Radar**:
    - Save-to-View Ratio (Benchmark: >1.5% is High Reference Value)
    - Share-to-View Ratio (Benchmark: >0.5% is Viral FYP Trigger)
    - Comment-to-View Ratio (Benchmark: >0.2% is High Conversation/Hook)
- **Right Column: Interactive Video Performance Ledger**:
  - **Filter & Sort Toolstrip**: Quick sort by ER%, Views, Saves, Virality Tier, or filter only Organic / Sponsored.
  - **Table View with Visual Mini-Bars**: Compact inline visual bars showing Save vs Share distribution per row.
  - **Side-by-Side Video Battle Drawer**: Select 2 rows to launch a comparative delta overlay.
  - **Granular Inspector**: Full 20-field technical inspection with zero fluff.

---

## 5. Next Steps for Implementation
1. **Phase 1 (Immediate UX Upgrade)**:
   - Add Instant Batch Sorting & Filter Toolstrip (Sort by ER%, Views, Saves, Tier).
   - Add "Intent Archetype" algorithm to classify videos into `Viral Loop`, `Evergreen Guide`, `Passive Fluff`, or `Underperforming`.
   - Add "Demo Sample Batch" button so users can instantly test the full dashboard without having to copy-paste URLs manually.
   - Add Side-by-Side Video Battle modal.
2. **Phase 2 (Expanded Capabilities)**:
   - Sound/Audio clustering.
   - Profile `@username` extractor.

