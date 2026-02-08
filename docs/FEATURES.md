# Features

## Components

| Component | Location | Description |
|-----------|----------|-------------|
| App Layout | src/App.jsx | Sidebar nav with company icons at top, icon navigation below |
| Dashboard | src/pages/Dashboard.jsx | Summary cards (Total/Rental/Retail Sales, Commission Due/Paid/Outstanding) + Recent Orders table |
| Clients | src/pages/Clients.jsx | Client list with search, add client dialog with form |
| Sales | _(removed)_ | Sales now accessed only via CompanyDetail > Sales tab |
| Commission | _(removed)_ | Commission now accessed only via CompanyDetail > Sales tab |
| SalesContext | src/context/SalesContext.jsx | Shared state for seasons (tabs) and orders with CRUD operations |
| TodoContext | src/context/TodoContext.jsx | Per-company to-do state (add, edit, toggle complete, pin/unpin, reorder, delete) |
| Companies | src/pages/Companies.jsx | Company list with add/edit, logo upload, archive/restore, drag-to-reorder |
| CompanyDetail | src/pages/CompanyDetail.jsx | Tab shell: header with Add Sale button + Dashboard/Sales/Commission pill tabs per company |
| CompanyDashboard | src/components/company/CompanyDashboard.jsx | Season dropdown, 4 summary cards, To Dos with searchable account dropdown, pin/unpin, drag-to-reorder, overdue styling |
| CompanySales | src/components/company/CompanySales.jsx | Per-company sales: season tabs, sticky first-column edit/delete actions, 4 clickable summary cards (Rental/Retail/Total Sales + Commission) that filter by order type, dual document upload (order + invoice), invoice # hyperlinks when doc uploaded, currency-formatted Total with $ prefix, commission % input with no-spinner and % suffix, "+Note" text button vs amber StickyNote icon, search, filters, inline edit, notes modal |
| CompanyCommission | src/components/company/CompanyCommission.jsx | Per-company commission: order-driven (Closed - Won orders), sticky first-column edit actions with status-aware backgrounds, clickable summary card filters (Earned/Paid/Outstanding), row highlighting (green=Paid, yellow=Partial), search bar, inline pay status editing |
| CompanyContext | src/context/CompanyContext.jsx | Shared company state (add, update, archive) used by sidebar and pages |
| Mock Data | src/data/mockData.js | Companies, clients, orders, commissions, seasons, todos based on real spreadsheet data |

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
