# Features

## Components

| Component | Location | Description |
|-----------|----------|-------------|
| App Layout | src/App.jsx | Sidebar nav with company icons at top, icon navigation below, auth guard, sign out button |
| Login | src/pages/Login.jsx | Email/password sign-in only (no public signup; users created via Supabase dashboard) |
| Dashboard | src/pages/Dashboard.jsx | Summary cards (Total/Rental/Retail Sales, Commission Due/Paid/Outstanding) + Recent Orders table |
| Clients | src/pages/Clients.jsx | Client list with search, add client dialog with form (uses ClientContext) |
| Sales | _(removed)_ | Sales now accessed only via CompanyDetail > Sales tab |
| Commission | _(removed)_ | Commission now accessed only via CompanyDetail > Sales tab |
| AuthContext | src/context/AuthContext.jsx | Auth state (user, loading), signUp, signIn, signOut via Supabase Auth |
| ClientContext | src/context/ClientContext.jsx | Client CRUD via Supabase + getClientName helper |
| SalesContext | src/context/SalesContext.jsx | Seasons + Orders + Commissions CRUD via Supabase |
| TodoContext | src/context/TodoContext.jsx | Per-company to-do CRUD via Supabase (add, edit, toggle complete, pin/unpin, reorder, delete) |
| CompanyContext | src/context/CompanyContext.jsx | Company CRUD via Supabase (add, update, archive, reorder) + logo upload to Storage |
| Companies | src/pages/Companies.jsx | Company list with add/edit, logo upload to Supabase Storage, archive/restore, drag-to-reorder |
| CompanyDetail | src/pages/CompanyDetail.jsx | Tab shell: header with Add Sale button + Dashboard/Sales/Commission pill tabs per company |
| CompanyDashboard | src/components/company/CompanyDashboard.jsx | Season dropdown, 4 summary cards, To Dos with searchable account dropdown, pin/unpin, drag-to-reorder, overdue styling |
| CompanySales | src/components/company/CompanySales.jsx | Per-company sales: season tabs, sticky first-column edit/delete actions, 4 clickable summary cards (Total Sales/Rental/Retail + Commission) that filter by order type, unified Add/Edit Sale modal (pencil opens pre-filled dialog), dual document upload to Supabase Storage inline next to Order # and Invoice # labels, invoice # hyperlinks with signed URLs when doc uploaded, currency-formatted Total with $ prefix, commission % input with no-spinner and % suffix, "+Note" text button vs amber StickyNote icon, search, filters, notes modal |
| CompanyCommission | src/components/company/CompanyCommission.jsx | Per-company commission: order-driven (Closed - Won orders), sticky first-column edit actions with status-aware backgrounds, clickable summary card filters (Earned/Paid/Outstanding), row highlighting (green=Paid, yellow=Partial), search bar, inline pay status editing persisted to Supabase |
| Supabase Client | src/lib/supabase.js | Supabase client init (uses VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) |
| DB Helpers | src/lib/db.js | All Supabase query helpers (companies, clients, seasons, orders, commissions, todos, storage) |
| Constants | src/lib/constants.js | Regions, account types, rental/retail item lists (extracted from mock data) |
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
