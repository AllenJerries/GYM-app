# 🏋️ The Change Fitness Gym

A production-quality, mobile-first gym membership management app for **The Change Fitness Gym** — Thondamuthur, Coimbatore, owned by **Sasikumar N (Owner & Head Coach)**. Built with pure HTML, CSS and JavaScript. No build step, no frameworks. Works offline in any modern browser and is ready to deploy on Vercel as a static site.

## ✨ Features

### Membership Lifecycle
- **Registration** — plans, offers (percentage / fixed / 1+1 / family), auto discount calculation, photo upload, custom fitness goals, payment status and expected payment date.
- **Renewal** — smart rule: renew-before-expiry continues from the current expiry date, renew-after-expiry starts from today. Months/years handled correctly across calendar boundaries.
- **Freeze / Resume** — freeze a membership for a period; expiry is extended automatically; "Frozen" status shows while a freeze is active, with full history.
- **Discontinue** — stop a membership with a reason and notes; recorded in the member's discontinuation history.

### Payments
- Record payments against any active membership with live balance, method, date and next expected payment.
- Payment status is always **computed from transactions** (Paid / Partially Paid / Pending) — never trusted to stale stored values.
- Payments page with status, method and member search filters plus Today / Week / Month / Outstanding summaries.

### Members
- Search by name, phone or ID (debounced).
- Rich filters: All, Active, Expiring, Expired, Frozen, Discontinued, Pending, Partially Paid.
- Full profile with photo, personal details, current membership (price / paid / balance), freeze history, discontinuation history, and membership timeline.
- One-tap **WhatsApp** reminder with pre-built message.
- **Family Groups** — link members and view the whole family at once.
- Duplicate detection on phone / WhatsApp / email.

### Business Intelligence
- Dashboard with expiry buckets (today / 3 / 7 days), frozen & discontinued counts, today's collection, monthly revenue, outstanding dues, and a smart Follow-Up queue (expiring + payment-due members).
- Reports: plan distribution, goal distribution, membership status, and payment-method charts (Chart.js), plus a **PDF monthly report** (jsPDF).
- Backup & restore to a JSON file.

### 🔒 Security & Data
- Optional **Admin PIN** (4–6 digits) shown only at login when enabled. Stored only in the browser.
- The app **starts with an empty database** — no sample members, plans, offers or fake payments are ever created.
- Members, plans, offers, payments and memberships are created **only by the admin** through the app itself. On first launch the dashboard welcomes you and the Members page shows an empty state.
- All data persists in `localStorage` under the app's storage key. Legacy data is auto-migrated on load (e.g. old "Stopped" → "Discontinued").
- **Reset all data** (Settings → Reset Database) permanently clears everything and starts fresh.
- Backup & restore to a JSON file preserves the real data you enter.
- Centralized business rules (`calcFinalPrice`, `offerApplies`, `getMemberStatus`, …) are kept decoupled from the UI so a future Flutter app can reuse the same logic.

## 📱 Device Support

- **Smartphone-first**: bottom navigation, FAB, bottom-sheet modals, 44+ px touch targets, 16px inputs (no iOS zoom), safe-area insets.
- **Tablet/Desktop** (≥768px): sidebar navigation, tables, multi-column grids.

## 🚀 Deploy to Vercel

1. Push this folder to a GitHub repo.
2. In Vercel: **Import Project → New Project → Select the repo**.
3. Framework preset: choose **Other** (no build step needed).
4. Click **Deploy**. Done.

You can also run it locally:

```bash
# any simple static server
npx serve .
```
Then open `http://localhost:3000`.

## 🔑 Demo Login
- Username: `admin@gym.com` · Password: `demo123` (pre-filled)
- Optional: set a PIN from **Settings → Admin Security**.

## 🧪 Project Structure
```
index.html       App shell, screens, modals
style.css        Mobile-first responsive styling
script.js        All logic & business rules (starts with an empty database)
assets/          Reserved for future assets
```

## 🛣️ Flutter Migration Path
The status engine and business rules live in pure functions (`getMemberStatus`, `calcFinalPrice`, `offerApplies`, `totalPendingAcrossMemberships`, …) with no DOM dependencies — designed to be ported 1:1 to Dart.