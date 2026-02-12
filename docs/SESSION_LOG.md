# Session Log

## 2026-02-07

**Worked on:** Initial project setup and full prototype build for Nitro sales/commission tracking app, based on the existing Google Sheets spreadsheet.

**Changes made:**
- Created project from `app-prototype` template (Vite + React + Tailwind CSS v4 + shadcn/ui)
- Analyzed the NITRO SALES Google Spreadsheet to understand data structure (clients, orders, seasons, commission tracking)
- Built 4 pages: Dashboard, Clients, Sales, Commission
- Dashboard: 6 summary cards (Total/Rental/Retail Sales, Commission Due/Paid/Outstanding) + Recent Orders table
- Clients: Searchable client table with Add Client dialog (25 accounts from spreadsheet)
- Sales: Season tabs (US/CA by year), rental/retail badges, orders table with items, order #, dates, totals
- Commission: Season tabs, summary cards, commission table sorted by outstanding amount with Paid/Partial/Unpaid badges
- Created mock data based on real spreadsheet data (clients, orders, commissions, seasons)
- Added inverted Nitro logo to sidebar navigation (sourced from Desktop/NITRO/Marketing Files)
- Sidebar: 64px wide, dark (bg-zinc-900), icon-only navigation with active state highlighting
- Pushed to GitHub: https://github.com/juliestromwall/nitro

**Next steps:**
- Add edit/delete functionality for clients
- Add ability to create new orders and commission entries
- Import more client data from the full spreadsheet (currently 25 of ~200+ accounts)
- Add order filtering/sorting within the Sales page
- Consider adding a commission summary view similar to the 🤑 tab (cross-season totals per account)

**Open questions:**
- Should the app support importing data from the spreadsheet or is manual entry preferred?
- Are there other users/roles beyond the sales rep who need access?
- What commission rate should be used (currently assumed 5% based on spreadsheet)?

## 2026-02-07 (session 2)

**Worked on:** Restructured Sales & Commission under CompanyDetail tabs; added To Dos feature.

**Changes made:**
- Moved Sales and Commission into per-company tabbed views under CompanyDetail (`/companies/:id`)
- Created `CompanyDashboard` component: season dropdown (persisted in localStorage), 4 summary cards, To Dos table
- Created `CompanySales` component: extracted from Sales.jsx, scoped by companyId, no company selector in Add Sale
- Created `CompanyCommission` component: extracted from Commission.jsx, scoped by companyId via order-based client filtering
- Created `TodoContext` for per-company to-dos with add/edit/toggle complete/delete
- Added todo seed data to mockData.js (5 items across 3 companies, some overdue)
- Rewrote `CompanyDetail` as tab shell: header + Dashboard/Sales/Commission tabs
- Simplified standalone `Sales.jsx` and `Commission.jsx` to company directory pages
- Updated FEATURES.md, PRODUCT.md

**Next steps:**
- Add edit/delete functionality for clients
- Import more client data from the full spreadsheet
- Add commission entry creation/editing within CompanyCommission
- Consider cross-company dashboard aggregation
- Push to GitHub

**Open questions:**
- Should To Dos have notifications/reminders?
- Should commission entries be editable inline like sales orders?

## 2026-02-07 (session 3)

**Worked on:** UI/UX improvements — streamlined navigation, enhanced To Dos, improved Sales notes.

**Changes made:**
- Removed standalone Sales and Commission pages and their nav bar items (no longer needed)
- Moved "+ Add Sale" button to CompanyDetail header (accessible from any tab)
- Styled Dashboard/Sales/Commission tabs as pill buttons (black bg + white text when active)
- To Dos: replaced plain `<select>` with searchable/typeahead account dropdown
- To Dos: added pin/unpin functionality (pinned items float to top, blue PinOff icon when pinned)
- To Dos: added drag-to-reorder with GripVertical handles (same pattern as Companies page)
- TodoContext: added `pinned`, `sortOrder`, `togglePin`, `reorderTodos` support
- Sales: renamed "+ Add Tab" to "+ New Sales Tracker"
- Sales: replaced inline notes editing with StickyNote icon → modal (filled amber icon when note exists)
- Updated FEATURES.md, PRODUCT.md

**Next steps:**
- Finish commission page rewrite
- Add edit/delete functionality for clients

**Open questions:**
- Should To Dos have notifications/reminders?

## 2026-02-07 (session 4)

**Worked on:** Green Add Sale button placement, Commission page rewrite.

**Changes made:**
- Moved "+ Add Sale" button to right of company name (after commission % badge), changed to green
- Rewrote CompanyCommission to be order-driven: any sale with stage "Closed - Won" creates a commission line
- Added Order #, Invoice #, and Total columns to commission table before Commission Due
- Renamed summary cards: "Total Commission Earned", "Total Commission Paid", "Total Commission Outstanding"
- Made summary cards clickable filters: Earned=show all, Paid=show Paid+Partial only, Outstanding=show everything except Paid
- Added row highlighting: Paid rows get green-50 tint, Partial rows get yellow-50 tint (matching badge colors)
- Commission Due calculated as order total * company commission %

**Next steps:**
- Add commission entry creation/editing (pay status, amount paid, paid date)
- Add edit/delete functionality for clients
- Import more client data from the full spreadsheet
- Consider cross-company dashboard aggregation

**Open questions:**
- Should commission pay status be editable inline?
- Should there be a way to mark individual order commissions as paid vs. paying at the client level?

## 2026-02-07 (session 5)

**Worked on:** Commission page enhancements — search bar, archive tabs, inline pay status editing.

**Changes made:**
- Added search bar to Commission tab (filters by account name, order #, invoice #, total) — placed under the 3 summary cards
- Added archive/restore season tabs to Commission (same pattern as Sales tab: hover to reveal archive button, archived dropdown with restore)
- Added inline pay status editing: click Edit pencil on any row to edit pay status (dropdown), amount paid, and paid date
- Commission overrides stored in local `commissionOverrides` state (keyed by order id)
- Pay status options: Paid, Partial, Unpaid, Invoice Sent, Pending Invoice
- Summary card totals update live after inline edits
- Added 5 pay status badge styles (green=Paid, yellow=Partial, red=Unpaid, blue=Invoice Sent, zinc=Pending Invoice)

**Next steps:**
- Add edit/delete functionality for clients
- Import more client data from the full spreadsheet
- Consider cross-company dashboard aggregation
- Minor styling/UI tweaks

**Open questions:**
- None at this time

## 2026-02-07 (session 6)

**Worked on:** Tab archive/edit UX revamp for Sales and Commission.

**Changes made:**
- Replaced hover archive icon on tabs with pencil edit icon (visible on all tabs, not just active)
- Merged create/edit into single tab dialog in CompanySales (mode flag: `editingTabId` null=create, set=edit)
- Edit modal pre-fills with current season name/year/dates and shows red "Archive" or green "Unarchive" button
- Archived dropdown now shows pencil edit icon per row (opens edit modal) instead of restore icon
- Added `FolderArchive` icon to archived dropdown button for better visual identity
- Added same edit tab dialog to CompanyCommission (edit-only, no create mode)
- Used `updateSeason` from SalesContext (already existed but wasn't used) to save tab edits
- Archiving the active tab auto-switches to the first remaining active season

**Next steps:**
- Add edit/delete functionality for clients
- Import more client data from the full spreadsheet
- Consider cross-company dashboard aggregation

**Open questions:**
- None at this time

## 2026-02-07 (session 7)

**Worked on:** Sales & Commission table UX improvements.

**Changes made:**
- Added sticky first column for edit/delete actions (Sales) and edit actions (Commission) — no scrolling needed to access controls
- Removed Documents column from Sales table; replaced single document upload with dual Order Document + Invoice Document uploads in Add Sale dialog
- Invoice # renders as blue hyperlink when an invoice document has been uploaded
- Notes column: shows "+Note" text when empty, amber StickyNote icon when note exists
- Total field: $ prefix, `inputMode="decimal"`, strips non-numeric chars, formats to 2 decimals on blur (both dialog and inline edit)
- Commission % input: no-spinner CSS class, % suffix, `inputMode="decimal"` (both dialog and inline edit)
- Replaced plain text summary line with 4 clickable Card components (Total Sales, Rental Total, Retail Total, Total Commission) — clicking Rental/Retail filters table, Total Sales clears filter; active card gets ring-2
- Card totals computed from unfiltered seasonOrders so values stay constant regardless of filters
- Commission table: sticky first column with status-aware backgrounds (green-50 for Paid, yellow-50 for Partial, blue-50 for editing)
- Removed `overflow-x-auto` from table.jsx wrapper to enable sticky columns
- Added `.no-spinner` CSS utility to index.css

**Next steps:**
- Refine UX based on user feedback
- Add edit/delete functionality for clients

**Open questions:**
- None at this time

## 2026-02-07 (session 8)

**Worked on:** UX refinements — modal-based editing, inline document uploads, card reorder.

**Changes made:**
- Replaced inline row editing with modal-based editing: clicking pencil opens the Add/Edit Sale dialog pre-filled with order data
- Unified Add/Edit into single dialog with `isEditMode` flag — title shows "Edit Sale" / "Add Sale", button shows "Save Changes" / "Add Sale"
- Account Name is disabled (grayed out) in edit mode
- Moved document upload controls inline next to Order # and Invoice # labels (small blue "Upload Doc" text links instead of separate sections at bottom)
- Uploaded documents show as Badge with filename and X to remove
- Reordered summary cards: Total Sales first (far left), then Rental Total, Retail Total, Total Commission
- Removed all inline editing code from table rows (cleaner, simpler)

**Next steps:**
- Add edit/delete functionality for clients
- Import more client data from the full spreadsheet
- Consider cross-company dashboard aggregation

**Open questions:**
- None at this time

## 2026-02-09

**Worked on:** Full Supabase backend integration — auth, database, storage, and deployment prep.

**Changes made:**
- **Phase 1 (Foundation):** Installed @supabase/supabase-js, created `.env`, `src/lib/supabase.js`, `src/lib/db.js` (all query helpers), `src/lib/constants.js` (extracted from mockData)
- **Phase 2 (Auth):** Created `AuthContext.jsx` (signUp/signIn/signOut), `Login.jsx` (email/password form), added AuthProvider to `main.jsx`, auth guard in `App.jsx`, sign out button in sidebar
- **Phase 3 (Entity Migration):** Created `ClientContext.jsx` (new), rewrote `CompanyContext.jsx`, `SalesContext.jsx` (now includes commissions), `TodoContext.jsx` — all using Supabase fetch/mutations. Rewrote `Dashboard.jsx`, `Clients.jsx`, `Companies.jsx`, `CompanyDetail.jsx`, `CompanyDashboard.jsx`, `CompanySales.jsx`, `CompanyCommission.jsx` to use contexts with snake_case field names
- **Phase 4 (Cleanup):** Deleted `src/data/mockData.js` and `src/data/` directory, verified no remaining mockData imports
- **Phase 5 (Schema + Seed):** Created `scripts/schema.sql` (6 tables with RLS + storage buckets/policies), `scripts/seed.js` (imports mock data for a user), `public/.htaccess` (SPA routing for Hostinger/Apache)
- **Phase 6 (Docs):** Updated `CLAUDE.md`, `FEATURES.md`, `PRODUCT.md`, this session log
- Build verified: `npm run build` succeeds (593KB JS bundle)

**Key architectural decisions:**
- All database columns use snake_case (PostgreSQL convention)
- Commissions link to `order_id` (one per Closed-Won order) instead of old client+season pattern
- `company.logo` → `company.logo_path`, `company.commissionPercent` → `company.commission_percent`
- Logos bucket is public, documents bucket is private (signed URLs)
- Auth guard: no user → Login page; authenticated → wrapped providers load data

**Next steps:**
- Create Supabase project and run `scripts/schema.sql` in SQL Editor
- Set real credentials in `.env` (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
- Create storage buckets (logos + documents) in Supabase dashboard
- Run `scripts/seed.js` to import mock data for first user
- `npm run build` and deploy `dist/` to Hostinger `public_html/`
- Add domain to Supabase auth allowed URLs
- Test multi-user isolation (sign up as second user → empty app)

**Open questions:**
- None at this time

## 2026-02-09 (session 2)

**Worked on:** Rebranding to RepCommish, VPS deployment, domain + SSL setup, Supabase URL config.

**Changes made:**
- Renamed app from "Nitro" to "RepCommish" — updated Login.jsx logo and index.html title
- Added RepCommish logo (`public/repcommish-logo.png`) to login page (h-28 size)
- Deployed built app to Hostinger VPS (Ubuntu 24.04, IP 187.77.10.132) via nginx + scp
- Configured nginx for SPA routing with `server_name repcommish.com www.repcommish.com`
- Set up DNS A records: `@ → 187.77.10.132` and `www → 187.77.10.132` in Hostinger DNS
- Installed Let's Encrypt SSL via certbot — HTTPS live on both repcommish.com and www.repcommish.com
- Updated Supabase Site URL from `http://187.77.10.132` to `https://repcommish.com`
- Added Supabase redirect URL: `https://repcommish.com/**`

**Next steps:**
- Test login end-to-end on https://repcommish.com
- Test multi-user isolation (sign up as second user → empty app)
- Consider adding www → non-www redirect in nginx

**Open questions:**
- None at this time

## 2026-02-09 (session 3)

**Worked on:** Favicon, title update, signup lockdown, search engine blocking.

**Changes made:**
- Added custom favicon (`public/favicon.png`) — black circle with white mountain "A" icon
- Changed page title from "RepCommish" to "REPCOMMISH" in index.html
- Updated favicon link in index.html from SVG to PNG
- Disabled "Allow new users to sign up" in Supabase Auth settings
- Removed sign up UI from Login.jsx — sign-in only (no toggle, no sign up button, no confirmation message)
- Added `public/robots.txt` with `Disallow: /` to block all search engine indexing
- Disabled "Confirm email" in Supabase Auth (not needed for admin-created users)
- Built and deployed all changes to VPS (https://repcommish.com)
- Committed and pushed to GitHub

**Deployment notes:**
- New users are added via Supabase dashboard > Authentication > Users > Add user / Invite user
- Public signups are fully disabled at both the Supabase level and the UI level

**Next steps:**
- Import client/order data or start entering manually
- Consider adding www → non-www redirect in nginx
- Add edit/delete functionality for clients

**Open questions:**
- None at this time

## 2026-02-10 (session 2)

**Worked on:** Add Sale modal UX enhancements — 2-step wizard polish, celebration popup, company branding, cents-first currency input.

**Changes made:**
- Ran `sale_type` column migration on remote Supabase database via SQL Editor (`ALTER TABLE orders ADD COLUMN sale_type text NOT NULL DEFAULT 'Prebook'`)
- Made Order Type and Stage required fields (must actively select, not pre-filled)
- Moved Stage field next to Close Date (side-by-side layout)
- Added celebration popup after adding a sale: animated confetti dots, bouncing company logo, random snowboarder hype messages (15 messages + 8 closers), green commission amount, "LET'S GO!" dismiss button
- Added company logo + name banner at the top of both Step 1 and Step 2 modals (matching page header style)
- Replaced live comma formatting with cents-first currency input: typing "4424" displays as "$44.24" (digits fill from right, fixed decimal)
- Made $ symbol and value text the same size (text-2xl font-bold)
- Added `max-h-[90vh] overflow-y-auto` to dialog for proper scrolling on smaller viewports
- Added `DialogTitle` and `DialogDescription` (sr-only) to celebration dialog to fix Radix warnings
- Removed unused `sanitizeCurrency`, `formatToTwoDecimals`, `formatLiveCurrency`, `stripCommas` helpers
- Added `centsToDisplay`, `centsToFloat`, `floatToCents` helper functions
- Updated FEATURES.md changelog
- Committed and pushed all changes to GitHub

**Next steps:**
- Deploy latest build to repcommish.com (VPS)
- Test celebration popup on production
- Add edit/delete functionality improvements
- Consider adding commission % override back to the modal (currently removed from JSX but logic preserved)

**Open questions:**
- None at this time

## 2026-02-10 (session 3)

**Worked on:** Customizable homepage, brand color consistency, CSV multi-line fix, Supabase pagination, stage system overhaul.

**Changes made:**
- **Customizable homepage:** Long-press or right-click the RepCommish logo to set any page as homepage (including company detail with specific tab). Logo navigates to saved homepage. "Reset to Dashboard" clears. Uses localStorage keyed by user ID. Tab restoration on CompanyDetail via `activeTab-{companyId}` localStorage.
- **Brand color consistency:** Unified `#005b5b` across active season tabs, archive/unarchive buttons, celebration popup "LET'S GO!" button. Updated CSS theme `--primary` and `--ring` to `#005b5b`.
- **Vertical logo:** Added `public/vertical-logo.png` for sidebar branding.
- **CSV multi-line fix:** Added `splitCSVRows()` to `src/lib/csv.js` that respects multi-line quoted fields (invoice numbers with newlines inside quotes were breaking row parsing). Multi-line values collapsed to spaces on import.
- **Supabase 1000-row pagination:** `fetchAccounts()` and `fetchOrders()` in `db.js` now paginate with `.range()` to fetch all rows beyond Supabase's default 1000-row limit.
- **Stage system overhaul:** "Order Placed" and "Cancelled" are permanent default stages on every company (can't be removed); users can still add custom stages. Cancelled orders: excluded from all totals (Sales, Dashboard, Company Dashboard, Commission), rows highlighted red with line-through on Sales table. Commission page now shows all non-cancelled orders (previously only "Closed - Won").
- **Commission % input:** Switched to `type="number"` with step/min/max, added `no-spinner` class, simplified onChange handler.
- Updated `docs/FEATURES.md` and `docs/PRODUCT.md`.
- All changes committed, pushed to GitHub, built and deployed to repcommish.com.

**Next steps:**
- Adam (adam@foundrydist.com) needs to hard-refresh browser to pick up new deployed code (commission page was filtering for "Closed - Won" in cached JS)
- Delete duplicate "Nitro Snowboards" company (id=5) from Adam's account (all orders are on id=4)
- Consider adding commission % override back to Add Sale modal UI
- Add edit/delete improvements for accounts

**Open questions:**
- None at this time

## 2026-02-11

**Worked on:** Invoice tracking, partial shipments, stacked table display, new shipping stages, commission report updates, deployment.

**Changes made:**
- **Invoice tracking (JSONB):** Added `invoices` JSONB column to orders table. Each invoice has number, amount, and optional document. Dynamic invoice list UI in Add/Edit Sale dialog with per-invoice document upload. Legacy `invoice_number`/`invoice_document` backward compatibility via `getInvoices()` helper.
- **Stacked table display:** Order numbers split on commas and stacked vertically. Invoice numbers stacked with amounts in parentheses. Both link to their attached documents (signed URLs, open in new tab). Pending shipment indicator ("Pending: $X,XXX") shown when invoiced amount < order total.
- **New default stages:** Added "Partially Shipped" (full total counts in sales/commission) and "Short Shipped" (excluded from totals, amber row styling). Short Shipped has a confirmation dialog before stage change takes effect.
- **EXCLUDED_STAGES constant:** `['Cancelled', 'Short Shipped']` in `src/lib/constants.js` replaces hardcoded `'Cancelled'` filter in CompanySales, CompanyDashboard, and Dashboard.
- **Commission report:** Shows Order Placed, Partially Shipped, AND Short Shipped orders (only Cancelled excluded). Stacked order/invoice display with document hyperlinks and pending indicator. Changed paid date from text input to native date picker.
- **Error handling:** Added try/catch to sale submit with fallback that retries without `invoices` field if column doesn't exist yet.
- **CSV import:** Converts imported `invoice_number` column into `invoices` array format.
- **Database migration:** Ran `ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoices jsonb DEFAULT '[]'` in Supabase SQL Editor.
- Updated `docs/FEATURES.md` and `docs/PRODUCT.md` with new terminology and changelog entries.
- All changes committed, pushed to GitHub, built and deployed to repcommish.com.

**Next steps:**
- Delete duplicate "Nitro Snowboards" company (id=5) from Adam's account
- Add edit/delete improvements for accounts
- Consider adding commission % override back to Add Sale modal UI

**Open questions:**
- None at this time
