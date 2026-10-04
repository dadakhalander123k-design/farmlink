# DirectFarm – Direct Farm-to-Buyer Marketplace

DirectFarm is a direct farm-to-buyer marketplace that connects local farmers directly with bulk buyers, retailers, and restaurants. It eliminates middlemen, provides market price transparency, calculates intelligent match scores, and optimizes multi-stop delivery routes.

---

## 1. Architecture Overview

- **Frontend**: Clean single-page application maintaining the custom warm palette (*Cosmic Latte* `#B7A89A`, *Mocha Cream* `#E8DCC6`, *Card* `#F4EDE0`, *Espresso* `#2B2118`, *Forest Olive* `#3F5B2E`).
- **Data Access Layer (`lib/api.js`)**: Encapsulates all Supabase calls, transforming database snake_case columns into clean client camelCase structures.
- **Pure Domain Modules**:
  - [`lib/pricing.js`](lib/pricing.js): Market reference price calculations, haversine road distance with a 1.25x road multiplier, delivery fee tiers, and price badges.
  - [`lib/matching.js`](lib/matching.js): 5-factor scoring formula (30% price + 25% quantity + 20% distance + 15% quality + 10% reliability) and greedy combination algorithm (`bestCombo`).
  - [`lib/routing.js`](lib/routing.js): Nearest-neighbour heuristic + 2-opt local search route optimizer.
- **Database & Security**:
  - PostgreSQL hosted on Supabase.
  - Enforced Row Level Security (RLS) on all tables (`profiles`, `profile_private`, `listings`, `requirements`, `offers`, `orders`).
  - Atomic business functions executed via stored procedures (`place_order`, `advance_order`, `decline_order`, `rate_order`, `accept_offer`, `decline_offer`).
  - Client-side image compression (max 1280px WebP/JPEG, quality ~0.8) uploaded to the `listing-photos` bucket in Supabase Storage with automatic SVG fallback.

---

## 2. Environment & Configuration

Client credentials are loaded in [`config.js`](config.js):

```javascript
window.__ENV = {
  SUPABASE_URL: 'https://ykymwiyleohoxluderod.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1fdznVkRU4PkwcmZ3bwxEg_bOBcN5y4'
};
```

> **Security Rule**: DirectFarm uses **only** the Supabase Publishable Key in client-side code. The `service_role` key and database passwords are never exposed. All table modifications and permissions are guarded by PostgreSQL Row Level Security.

An [`.env.example`](.env.example) template is provided for framework environments:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://ykymwiyleohoxluderod.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_1fdznVkRU4PkwcmZ3bwxEg_bOBcN5y4
```

---

## 3. Database Migration Steps (Manual Actions in Supabase)

To link the database, perform the following in your [Supabase Dashboard](https://supabase.com/dashboard/project/ykymwiyleohoxluderod):

1. **SQL Editor**:
   - Open **SQL Editor** > **New Query**.
   - Copy the complete contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
2. **Authentication Settings**:
   - Go to **Authentication** > **Providers** > **Email**.
   - Ensure Email provider is **Enabled**.
   - Turn **OFF** "Confirm email" for the MVP demo (enables immediate sign-in upon registration).
3. **URL Configuration**:
   - In **Authentication** > **URL Configuration**, add your local URL:
     - `http://localhost:3000`
4. **Table Editor Verification**:
   - Open **Table Editor** and verify that all tables (`profiles`, `profile_private`, `listings`, `requirements`, `offers`, `orders`) display the badge **"RLS enabled"**.

---

## 4. Running Locally

### Development Server
Run the local dev server using Node/npx:
```bash
npm run dev
```
Or with Python:
```bash
python -m http.server 3000
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 5. Running Tests

The test suite runs using Node's native test runner without third-party test dependencies:
```bash
npm test
```
Tests cover:
- Haversine distance, symmetry, null coordinates, and road factor.
- Delivery fee minimums (₹40) and distance rounding.
- Market reference fallback logic (requires ≥ 2 live listings for live mean).
- Price badges (*Great deal*, *Fair price*, *Slightly high*, *Above market*).
- Match score boundary edge cases (zero quantity, crop mismatch, grade deficits, price ceilings, distance boundaries).
- Multi-farmer requirement combination algorithm (`bestCombo`).
- Route planning (nearest-neighbour with 2-opt optimization).
- Atomic stock decrement and race-condition prevention simulations.

---

## 6. Seed Data Policy

DirectFarm enforces a strict **Zero-Fake-Data** policy:
- No mock listings, fake farmers, simulated buyers, or placeholder orders are seeded into the database or bundled in the client code.
- All metrics and counters on the landing page and dashboards represent genuine database records.
