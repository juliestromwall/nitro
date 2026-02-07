# Features

## Components

| Component | Location | Description |
|-----------|----------|-------------|
| App Layout | src/App.jsx | Sidebar nav with Nitro logo, icon navigation, and main content area |
| Dashboard | src/pages/Dashboard.jsx | Summary cards (Total/Rental/Retail Sales, Commission Due/Paid/Outstanding) + Recent Orders table |
| Clients | src/pages/Clients.jsx | Client list with search, add client dialog with form |
| Sales | src/pages/Sales.jsx | Season tabs (US/CA by year), summary row, orders table with type badges |
| Commission | src/pages/Commission.jsx | Season tabs, summary cards, commission table sorted by outstanding amount |
| Companies | src/pages/Companies.jsx | Company list with add/edit, archive/restore, logo display, YTD & all-time sales |
| CompanyDetail | src/pages/CompanyDetail.jsx | Per-company dashboard with sales, commission summary, and orders by season |
| CompanyContext | src/context/CompanyContext.jsx | Shared company state (add, update, archive) used by sidebar and pages |
| Mock Data | src/data/mockData.js | Companies, clients, orders, commissions, seasons based on real spreadsheet data |

## Changelog

| Date | Change |
|------|--------|
| 2026-02-07 | Initial prototype: Dashboard, Clients, Sales, Commission pages |
| 2026-02-07 | Added Nitro logo (inverted) to sidebar navigation |
| 2026-02-07 | Added Companies page, company quick links in sidebar, archive, CompanyDetail dashboards |
