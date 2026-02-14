# Features

## Components

| Component | Location | Description |
|-----------|----------|-------------|
| App Layout | src/App.jsx | Sidebar nav with company icons at top, icon navigation below, auth guard, sign out button, customizable homepage (long-press/right-click logo to set any page as homepage) |
| Login | src/pages/Login.jsx | Email/password sign-in only (no public signup; users created via Supabase dashboard) |
| Dashboard | src/pages/Dashboard.jsx | Cross-brand reporting: year selector (2025–2050), summary cards (Total Sales, Commission Earned, Commission Owed), brand table with logo + per-brand totals + totals row |
| Accounts | src/pages/Accounts.jsx | Account list with search, add/import accounts (CSV import, uses AccountContext) |
| Sales | _(removed)_ | Sales now accessed only via CompanyDetail > Sales tab |
| Commission | _(removed)_ | Commission now accessed only via CompanyDetail > Sales tab |
| AuthContext | src/context/AuthContext.jsx | Auth state (user, loading), signUp, signIn, signOut via Supabase Auth |
| AccountContext | src/context/AccountContext.jsx | Account CRUD (single + bulk CSV import) via Supabase + getAccountName helper |
| SalesContext | src/context/SalesContext.jsx | Seasons + Orders + Commissions CRUD via Supabase |
| TodoContext | src/context/TodoContext.jsx | Per-company to-do CRUD via Supabase (add, edit, toggle complete, pin/unpin, reorder, delete) |
| CompanyContext | src/context/CompanyContext.jsx | Company CRUD via Supabase (add, update, archive, reorder) + logo upload to Storage |
| Companies | src/pages/Companies.jsx | Company list with add/edit, logo upload to Supabase Storage, archive/restore, drag-to-reorder, per-category commission rate overrides |
| CompanyDetail | src/pages/CompanyDetail.jsx | Tab shell: header with Add Sale button + Dashboard/Sales/Commission pill tabs per company |
| CompanyDashboard | src/components/company/CompanyDashboard.jsx | Season dropdown, 4 summary cards, To Dos with searchable account dropdown, pin/unpin, drag-to-reorder, overdue styling |
| CompanySales | src/components/company/CompanySales.jsx | Per-company sales: season tabs, **account-grouped table** (orders grouped by account with header rows showing account name, order count, group total, invoices with doc links, pending amount, and "Add Invoice" button), group invoice modal (manage invoices at account level — stored on first order in group), sticky first-column edit/delete actions, clickable summary cards that filter by order type, 2-step Add/Edit Sale wizard with company logo+name header (Step 1: Sale Type, Tracker, Account; Step 2: Order Type, Items, Order #, Total, Stage, Close Date, Notes), Sale Type column in table (Prebook/At Once), document upload on Order #, cents-first currency Total input (typing "4424" → $44.24), required Order Type and Stage fields, Stage next to Close Date, stages include Partially Shipped and Short Shipped (with confirmation dialog and amber row styling, excluded from totals), celebration popup after adding a sale, scrollable modal (max-h-90vh), "+Note" text button vs amber StickyNote icon, search, filters, notes modal, CSV import with tracker confirmation dialog |
| CompanySettings | src/components/company/CompanySettings.jsx | Per-company settings: configurable order types, items, and stages lists with add/remove chips and save button |
| CompanyCommission | src/components/company/CompanyCommission.jsx | Per-company commission: order-driven (excludes Cancelled and Short Shipped), **account-grouped table** (clickable group header rows to expand/collapse, showing account name, order count, combined total, combined commission due, invoices with doc links, pending amount, and "+ Payment" button), **account-level payment modal** (Pay Status dropdown, summary with Commission Due/Total Paid/Remaining, multiple payments with amount + date, stored on first order's commission record), clickable summary card filters (Earned/Paid/Outstanding), row highlighting (green=Paid, yellow=Partial), search bar |
| Supabase Client | src/lib/supabase.js | Supabase client init (uses VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) |
| CSV Parser | src/lib/csv.js | CSV parsing utilities: `parseCSVLine` (handles quoted fields with commas) and `splitCSVRows` (handles multi-line quoted fields) |
| DB Helpers | src/lib/db.js | All Supabase query helpers (companies, clients, seasons, orders, commissions, todos, storage) with pagination for 1000+ row tables |
| Constants | src/lib/constants.js | Regions, account types, EXCLUDED_STAGES (Cancelled, Short Shipped) |
| SQL Schema | scripts/schema.sql | Full PostgreSQL schema with RLS policies and storage buckets |
| Seed Script | scripts/seed.js | One-time seed script to import mock data for a user |

## Changelog

| Date | Change |
|------|--------|
| 2026-02-07 | Initial prototype: Dashboard, Clients, Sales, Commission pages |
| 2026-02-07 | Added Nitro logo (inverted) to sidebar navigation |
| 2026-02-07 | Added Companies page, company quick links in sidebar, archive, CompanyDetail dashboards |
| 2026-02-07 | Restructured sidebar: company icons at top, logo upload, drag-to-reorder |
| 2026-02-07 | Rewrote Sales page: custom tabs, add/archive tabs, inline edit/delete orders |
| 2026-02-07 | Sales enhancements: Invoice # and Documents columns, search bar, Order Type and Stage column filters, archived tab dropdown with restore |
| 2026-02-07 | Sales: Commission column (auto-calculated from company %), Notes column, Add Sale dialog with searchable client dropdown, commission override with visual flag, horizontally scrollable table |
| 2026-02-07 | Restructured Sales & Commission under CompanyDetail tabs; added TodoContext and CompanyDashboard with To Dos; Sales/Commission pages now show company directory |
| 2026-02-07 | Removed standalone Sales/Commission pages and nav items; Add Sale button moved to company header; pill-style tabs (black/white); To Dos: searchable account typeahead, pin/unpin, drag-to-reorder; Sales: notes modal via StickyNote icon, "+ New Sales Tracker" rename |
| 2026-02-07 | Add Sale button moved next to company name (green); Commission rewritten: order-driven from Closed-Won sales, shows Order #/Invoice #/Total, clickable summary cards filter table (Earned=all, Paid=paid+partial, Outstanding=not paid), row highlighting by pay status |
| 2026-02-07 | Commission enhancements: search bar (account, order #, invoice #, total), archive/restore season tabs (same pattern as Sales), inline pay status editing (pay status dropdown, amount paid, paid date with Save/Cancel) |
| 2026-02-07 | Tab edit UX revamp: replaced hover archive icon with pencil edit icon on all tabs; merged create/edit into single dialog with mode flag; edit modal shows Archive/Unarchive button; archived dropdown shows pencil edit icons; FolderArchive icon for archived dropdown; applies to both Sales and Commission tabs |
| 2026-02-07 | Sales & Commission table UX: sticky first-column edit actions (no scroll needed), removed Documents column, dual document upload in Add Sale dialog, invoice # hyperlinks, "+Note" vs amber icon, $ currency formatting with decimal sanitization, % commission input with no-spinner CSS, 4 clickable summary cards on Sales page, status-aware sticky backgrounds on Commission |
| 2026-02-07 | Sales UX refinements: replaced inline row editing with modal-based editing (pencil opens pre-filled Add/Edit dialog), unified Add/Edit Sale dialog with isEditMode flag, document uploads moved inline next to Order # and Invoice # labels, Total Sales card reordered to first position |
| 2026-02-09 | Supabase backend: Added auth (email/password), migrated all contexts from mock data to Supabase (PostgreSQL + RLS), added file storage (logos public, documents private with signed URLs), created AuthContext, ClientContext, Login page, db helpers, constants, SQL schema, seed script, .htaccess for Hostinger SPA routing. Deleted mockData.js. |
| 2026-02-09 | Rebranded to RepCommish: custom logo on login, favicon, title "REPCOMMISH". Deployed to Hostinger VPS with nginx + SSL (repcommish.com). |
| 2026-02-09 | Locked down signups: removed sign up UI from login page, disabled signups in Supabase, added robots.txt to block search engines. |
| 2026-02-10 | Renamed "Clients" to "Accounts" throughout the app (UI, contexts, db helpers, routes). Added CSV import for bulk account creation. Added CSV import for sales (per-tracker with confirmation dialog). |
| 2026-02-10 | Custom company settings: per-company configurable order types, items, and stages. Settings tab on CompanyDetail. Unified items column on orders (replaced rental_items/retail_items). Multi-select item checkboxes in Add Sale dialog. Dynamic per-order-type summary cards. Removed hardcoded Rental/Retail split from Dashboard and Sales. |
| 2026-02-10 | Add/Edit Sale modal redesigned as 2-step wizard: Step 1 (Sale Type, Tracker, Account), Step 2 (Order Type, Items, Order #, Total, Stage, Close Date, Notes). Added sale_type column (Prebook/At Once) to orders table and sales table. Removed Invoice # and Commission % Override from modal. Prominent Total input with larger text. Modal prevents outside-click dismiss. |
| 2026-02-10 | Step 2 UX enhancements: required Order Type and Stage fields (must select, not pre-filled), Stage moved next to Close Date, company logo in modal footer, live comma-formatted Total with large $ sign. Added celebration popup after adding a sale with animated confetti dots, bouncing company logo, random snowboarder hype messages, green commission amount, and "LET'S GO!" dismiss button. |
| 2026-02-10 | Modal branding: company logo + name header on both wizard steps. Cents-first currency input (typing digits fills from right, e.g. "4424" → $44.24). Reduced Total input to text-2xl. Added max-h-[90vh] overflow-y-auto to modal for small viewports. |
| 2026-02-10 | Customizable homepage: long-press or right-click the RepCommish logo to set any page as homepage (including company detail with specific tab). Logo click navigates to saved homepage instead of always Dashboard. "Reset to Dashboard" option to clear. Uses localStorage keyed by user ID. |
| 2026-02-10 | Brand color consistency: unified #005b5b across active season tabs, buttons, and CSS theme vars (--primary, --ring). |
| 2026-02-10 | CSV multi-line fix: added splitCSVRows() to handle multi-line quoted fields (invoice numbers with embedded newlines). |
| 2026-02-10 | Supabase pagination: fetchAccounts() and fetchOrders() now paginate past the 1000-row default limit. |
| 2026-02-10 | Stage system overhaul: "Order Placed" and "Cancelled" are permanent default stages. Cancelled orders excluded from all totals, highlighted red with line-through on Sales. Commission page shows all non-cancelled orders. |
| 2026-02-11 | Dashboard repurposed as cross-brand reporting page: year selector (2025–2050), 3 summary cards, brand table with logo/name/sales/commission. Commission calculated from order data + company rate (not commissions table). Sales tracker: Year field changed from free-text to dropdown (2025–2050), removed start/end date fields. Nav icon changed from LayoutDashboard to BarChart3. |
| 2026-02-11 | Invoice tracking & partial shipments: added invoices JSONB column to orders table. Dynamic invoice list in Add/Edit Sale (number, amount, document per invoice). Stacked order/invoice numbers in Sales and Commission tables with document hyperlinks. Pending shipment indicator. New default stages: Partially Shipped (full total counts) and Short Shipped (excluded from totals, amber row styling, confirmation dialog). EXCLUDED_STAGES constant replaces hardcoded 'Cancelled' filter across all dashboards. CSV import converts invoice_number to invoices array. |
| 2026-02-12 | Account-grouped orders with shared invoices: Sales and Commission tables now group orders by account. Group header rows show account name, order count, group total, invoices (with doc links), pending amount, and "Add Invoice" button. Invoices managed at account level via group invoice modal (stored on first order in group). Removed per-order invoice editing from Add/Edit Sale dialog. Removed Account Name and Invoice # columns from table headers (now in group header). |
| 2026-02-12 | Clickable account rows, account-level payments, sidebar logo fix: Entire group header rows are clickable to expand/collapse (Sales + Commission). Commission page: replaced per-order inline editing with account-level payment modal ("+ Payment" button on group rows opens modal with Pay Status, payment list with amount + date, auto status calculation). Sidebar brand logos now have white background containers for visibility. Deployed to repcommish.com. |
| 2026-02-14 | Per-category commission rates: Companies can set different commission % per category (e.g., Rental 7%, Retail 4%) via the Edit Brand form. Category rates are used as the expected rate — only manual per-order overrides show the hazard icon. Add Sale form auto-updates commission % when category changes. Short-shipped logic uses weighted average rate. Fixed "Unpaid" pay status not persisting in commission aggregation. Deployed to repcommish.com. |
