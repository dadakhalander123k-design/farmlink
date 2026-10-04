# DirectFarm 3-Minute Live Demo Script

This script walks through the complete end-to-end lifecycle of a direct farm deal using genuine database interactions.

---

### Minute 0:00 – 0:45 | Farmer Sign-up & Produce Listing
1. Open the DirectFarm landing page at **`http://localhost:3000/#/`**.
2. Click **"Sell produce"** (or navigate to `#/farmer/login`).
3. Toggle to **"Create account"** and enter:
   - **Name**: Ramesh Patel
   - **Email**: ramesh@example.com
   - **Phone**: 9876543210
   - **Farm Name**: Patel Organic Farms
   - **Farm Location**: Bhimavaram
   - **Password**: password123
4. Click **Create account**. You are redirected to the Farmer Dashboard (`#/farmer/overview`).
5. Click **"Add produce"** in the navigation tabs:
   - **Crop**: Tomato
   - **Quality**: Grade A (premium)
   - **Quantity**: 500 kg
   - **Expected Price**: ₹24 / kg (observe the real-time market reference hint showing it is 8% below market: *Great deal*)
   - **Pickup Location**: Bhimavaram
   - **Photo**: Select an image file or leave blank for the native SVG illustration.
6. Click **"Publish produce"**. The listing is committed to the PostgreSQL `listings` table and appears under **"My listings"**.

---

### Minute 0:45 – 1:30 | Buyer Sign-up & Requirement Posting
1. In an Incognito window (or after logging out), navigate to **`http://localhost:3000/#/buyer/login`**.
2. Click **"Create account"** and register:
   - **Name**: Priya Sharma
   - **Email**: priya@grandhotel.com
   - **Phone**: 9123456780
   - **Business Name**: Grand Bay Hotel & Restaurant
   - **Buyer Type**: Restaurant or hotel
   - **Delivery Location**: Vijayawada
   - **Password**: password123
3. Click **"Create account"** to open the Buyer Dashboard.
4. Click **"Post requirement"**:
   - **Crop**: Tomato
   - **Minimum Quality**: Grade B
   - **Quantity Needed**: 400 kg
   - **Highest Price**: ₹28 / kg
   - **Farmers within**: 120 km
5. Click **"Post requirement"**.
6. Navigate to **"My requirements"**:
   - Observe the intelligent match card displaying **Patel Organic Farms** with a calculated match percentage ring (~90%).
   - Expand the match card to see the 5 weighted sub-scores (*Price, Quantity, Distance, Quality, Reliability*).

---

### Minute 1:30 – 2:15 | Direct Offer & Atomic Order Creation
1. Switch back to the Farmer tab (`#/farmer/buyers`):
   - Notice the requirement from **Grand Bay Hotel & Restaurant** has appeared live via Realtime.
   - Click **"Send offer"**: supply 400 kg at ₹24/kg with delivery included.
2. In the Buyer tab (`#/buyer/reqs`):
   - The farmer's offer appears under **"Offers from farmers"**.
   - Click **"Accept"**.
   - The database stored procedure `accept_offer` executes atomically:
     - 400 kg is deducted from Patel Organic Farms' listing.
     - The requirement is marked `fulfilled`.
     - An order is automatically generated and confirmed.

---

### Minute 2:15 – 3:00 | Route Planning, Status Advancement & Rating
1. In the Farmer tab:
   - Go to **"Delivery route"** (`#/farmer/route`):
     - View the 2-Opt optimized delivery path on the vector map connecting Bhimavaram to Vijayawada.
     - Note the road distance (~116 km), estimated delivery time, and fuel cost projection.
   - Go to **"Orders"** (`#/farmer/orders`):
     - Click **"Start preparing"** → **"Mark out for delivery"** → **"Mark delivered"**.
     - Observe the step timeline and timestamp history recorded at each stage.
     - Note the **"Call buyer (9123456780)"** button enabled by counterparty RLS permissions.
2. In the Buyer tab (`#/buyer/orders`):
   - Status updates in real-time to **Delivered**.
   - Click **"Rate this seller"**, choose 5 stars, and click **"Submit rating"**.
   - The rating updates the farmer's aggregated rating in the `seller_stats` view.
