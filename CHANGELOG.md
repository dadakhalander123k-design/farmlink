# CHANGELOG

## [2.0.0] - Production Backend Migration & Bug Fixes

### Added
- **Supabase Integration**:
  - Connected client to remote Supabase instance (`https://ykymwiyleohoxluderod.supabase.co`).
  - Implemented exact relational database schema in [`supabase/schema.sql`](supabase/schema.sql) with tables for `profiles`, `profile_private`, `listings`, `requirements`, `offers`, and `orders`.
  - Configured Row Level Security (RLS) policies guaranteeing role segregation (farmers can only edit their own listings; private contact phones are only viewable by order counterparties).
- **Data Access Layer (`lib/api.js`)**:
  - Unified module isolating all Supabase calls from UI presentation logic.
  - Automatically transforms database `snake_case` fields to UI `camelCase`.
- **Pure Algorithmic Modules**:
  - Created [`lib/pricing.js`](lib/pricing.js), [`lib/matching.js`](lib/matching.js), and [`lib/routing.js`](lib/routing.js) supporting both Node.js/CommonJS and browser global runtime.
- **Automated Test Suite**:
  - Implemented unit tests in [`tests/unit.test.js`](tests/unit.test.js) and integration simulations in [`tests/integration.test.js`](tests/integration.test.js) running via `npm test`.
- **Atomic Concurrency Protection**:
  - Implemented `place_order`, `advance_order`, `decline_order`, `rate_order`, `accept_offer`, and `decline_offer` as PostgreSQL security-definer functions with `FOR UPDATE` row locks to eliminate stock race conditions.
- **Realtime Updates**:
  - Subscribed to PostgreSQL changes on `listings`, `orders`, `offers`, and `requirements` for automatic live dashboard updates without page reloads.
- **Direct Phone Contact**:
  - Added order card tap-to-call buttons fetching counterparty phone numbers securely from `profile_private`.
- **Client-Side Photo Compression**:
  - Client-side canvas compression to max 1280px WebP format before uploading to the `listing-photos` bucket, with graceful fallback to inline SVG crop illustrations on upload failure or offline states.

### Fixed & Removed
- **Race Condition on Final Stock**:
  - *Bug*: In the initial prototype, multiple simultaneous buyers could purchase the same remaining inventory.
  - *Fix*: Handled atomically in the database via `place_order` and `accept_offer` using `SELECT FOR UPDATE` locks and row quantity checks.
- **Role Hijacking / Cross-Role Logins**:
  - *Bug*: Logins did not strictly verify that the user's registered role matched the entry portal.
  - *Fix*: Added strict role verification on login (`profile.role === expectedRole`). If mismatched, session is immediately revoked and a clear guidance message is displayed.
- **Form Double Submissions**:
  - *Bug*: Rapid double clicks on "Publish produce" or "Place order" could generate duplicate records.
  - *Fix*: Added `isSubmitting` guard and disabled submit buttons during active network requests.
- **Plain-Text Passwords & Local Storage**:
  - *Removed*: All plain-text password storage and mock `localStorage` databases.
  - *Removed*: The "Reset local data" button.
  - *Rule Maintained*: Zero fake or seeded users, listings, or orders exist in the application.
