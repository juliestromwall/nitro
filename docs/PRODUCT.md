# Product

## Overview

**What:** RepCommish — Sales and commission tracking app for sales reps
**For:** Sales rep tracking client accounts, orders (rental & retail), and commission payments
**URL:** https://repcommish.com

## User Roles

| Role | Access | Key Screens |
|------|--------|-------------|
| Sales Rep | Full access (own data only, enforced by RLS) | Login, Dashboard, Accounts, Companies, CompanyDetail |

## Key Flows

1. **Sign In** - Email/password auth via Supabase; public signups disabled, new users created via Supabase dashboard (data isolated per user via RLS)
2. **View Dashboard** - See total sales, commission due, and outstanding payments at a glance
3. **Manage Companies** - Add/edit companies with commission %, logo upload (Supabase Storage), archive/restore, view per-company dashboards
4. **Manage Accounts** - Add/import accounts (single or CSV), view account list with region/type/location
5. **Company Detail** - Click a company to see Dashboard/Sales/Commission tabs scoped to that company
6. **Track Sales** - Per-company: view orders by season, add/edit/delete, search and filter, upload order/invoice documents (Supabase Storage with signed URLs)
7. **Track Commission** - Per-company: see what's owed, paid, and outstanding by season; inline pay status editing persisted to Supabase
8. **Manage To Dos** - Per-company: add, edit, complete, pin/unpin, drag-to-reorder, and delete to-do items with searchable account dropdown, due dates, and overdue highlighting
9. **Set Homepage** - Long-press or right-click the RepCommish logo to set any page (including a company detail tab) as the default homepage; logo click navigates there instead of Dashboard
10. **Toggle Dark Mode** - Click the sun/moon icon in the top-right bar to switch between light and dark themes; persists across sessions via localStorage
11. **Update Profile** - Click avatar in top-right bar to open settings dialog; upload avatar photo (Supabase Storage), change email (sends confirmation), or change password
12. **Sign Out** - Log out from sidebar; returns to login screen

## Terminology

| Term | Meaning |
|------|---------|
| Account | A client/shop/resort that buys Nitro products |
| Season | Sales year period (e.g., 2025-2026) spanning US and Canada |
| Rental | Rental equipment orders (boards, boots, bindings) |
| Retail | Retail/demo product orders |
| Order Type | Rental or Retail classification |
| Stage | Order status — "Order Placed", "Partially Shipped", "Short Shipped", and "Cancelled" are permanent defaults; custom stages can be added per company. Cancelled and Short Shipped orders are excluded from all totals and commission. |
| Invoice | A shipment invoice managed at the account-group level (all orders for the same account in a season). Each invoice has a number, amount, and optional document. Stored on the first order in the group. |
| Pending Amount | The difference between account group total and sum of invoice amounts — indicates unshipped/uninvoiced inventory. |
| Company | A brand the rep earns commission from (e.g., Nitro, Union, 686) |
| Commission | Percentage of sales owed to the rep (varies per company, optionally per category) |
| Category Commission | Optional per-category commission rate override (e.g., Rental 7%, Retail 4%). When set, used as the expected rate instead of the company default. Stored as JSONB on the company record. |
| Pay Status | Whether commission has been paid (Paid, Partial, Unpaid, Invoice Sent, Pending Invoice) — managed at the account level, not per-order |
| Payment | An individual commission payment with amount and date, tracked at the account-group level. Multiple payments supported per account. Stored as JSONB on the first order's commission record. |
| Sale Type | Prebook or At Once — indicates when the sale was made relative to the season |
| Region | Geographic area (Rockies, PNW, Southeast, etc.) |
| Account Type | Ski Shop (Off Site), Resort, Resort SARA Group, Chain |
| To Do | A per-company task item with title, note, account, phone, and due date |
| RLS | Row Level Security — Supabase/PostgreSQL feature ensuring users can only access their own data |
| Dark Mode | App-wide dark theme toggled via TopBar icon; uses Tailwind CSS v4 `.dark` class on document root with `dark:` variant classes throughout; anti-flash inline script in index.html prevents white flash on load |
| Avatar | User profile photo uploaded to Supabase Storage `avatars` bucket (public); shown in TopBar and UserSettingsDialog |
| Signed URL | Temporary authenticated URL for accessing private documents in Supabase Storage |

## Pages

| Page | Description |
|------|-------------|
| Login | Email/password sign in only (shown when not authenticated; no public signup) |
| Dashboard | Summary stats: total sales, rental/retail breakdown, commission due/paid |
| Accounts | Account list with add/import CSV, filterable by region and type |
| ~~Sales~~ | _(Removed — Sales accessed via CompanyDetail > Sales tab)_ |
| ~~Commission~~ | _(Removed — Commission accessed via CompanyDetail > Commission tab)_ |
| Companies | Company management with commission %, logo upload, quick links in sidebar |
| CompanyDetail | Tabbed view (Dashboard/Sales/Commission) scoped to a single company |
