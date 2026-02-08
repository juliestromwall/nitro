# Features

## Components

| Component | Location | Description |
|-----------|----------|-------------|
| App Layout | src/App.jsx | Sidebar nav with company icons at top, icon navigation below |
| Dashboard | src/pages/Dashboard.jsx | Summary cards (Total/Rental/Retail Sales, Commission Due/Paid/Outstanding) + Recent Orders table |
| Clients | src/pages/Clients.jsx | Client list with search, add client dialog with form |
| Sales | src/pages/Sales.jsx | Company directory linking to per-company sales views |
| Commission | src/pages/Commission.jsx | Company directory linking to per-company commission views |
| SalesContext | src/context/SalesContext.jsx | Shared state for seasons (tabs) and orders with CRUD operations |
| TodoContext | src/context/TodoContext.jsx | Per-company to-do state (add, edit, toggle complete, delete) |
| Companies | src/pages/Companies.jsx | Company list with add/edit, logo upload, archive/restore, drag-to-reorder |
| CompanyDetail | src/pages/CompanyDetail.jsx | Tab shell: header + Dashboard/Sales/Commission tabs per company |
| CompanyDashboard | src/components/company/CompanyDashboard.jsx | Season dropdown, 4 summary cards, To Dos table with add/edit/complete/delete and overdue styling |
| CompanySales | src/components/company/CompanySales.jsx | Per-company sales: season tabs, search, filters, inline edit, scrollable table, Add Sale (no company selector) |
| CompanyCommission | src/components/company/CompanyCommission.jsx | Per-company commission: season tabs, summary cards, commission table filtered by company's clients |
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
