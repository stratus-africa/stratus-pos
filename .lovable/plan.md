

# Multi-Tenant SaaS POS System — MVP Plan

## Overview
A multi-tenant POS + Inventory + Accounting platform for Kenyan retail shops. Feature-rich dashboard style (Zoho-like) with dense data views and lots of controls. Built on Lovable Cloud (Supabase).

---

## Phase 1: Foundation — Auth & Multi-Tenant Setup

### Database Schema (Lovable Cloud)
- **businesses** — id, name, currency (default KES), timezone, logo_url, created_at
- **locations** — id, business_id, name, type (store/warehouse), address
- **user_roles** — id, user_id, role (admin/manager/cashier), business_id
- **profiles** — id (FK auth.users), full_name, phone, avatar_url, business_id

### Auth & Onboarding
- Email/password signup → create business → create first location → assign admin role
- Login screen with business selection (if user belongs to multiple)
- RLS policies: every table filtered by `business_id`, role-based access via `has_role()` function

### App Shell
- Sidebar layout (ShadCN Sidebar) with navigation: Dashboard, POS, Products, Inventory, Purchases, Sales, Expenses, Reports, Settings
- Top bar with business name, location selector, user menu
- Role-based menu visibility (cashiers see only POS + limited views)

---

## Phase 2: Product & Inventory Management

### Products Module
- **categories** — id, business_id, name, parent_id (nested)
- **brands** — id, business_id, name
- **units** — id, business_id, name (pcs, kg, litre, etc.)
- **products** — id, business_id, name, sku, barcode, category_id, brand_id, unit_id, purchase_price, selling_price, tax_rate, image_url, is_active
- **product_variations** — id, product_id, name (e.g. size/color), sku, price_override

### Product UI
- Data table with search, filters (category, brand, status), bulk actions
- Product form: name, SKU, barcode, prices, category, brand, unit, image upload
- Import/export CSV

### Inventory Module
- **inventory** — id, product_id, location_id, quantity, low_stock_threshold
- **stock_adjustments** — id, product_id, location_id, quantity_change, reason, created_by, created_at
- **stock_transfers** — id, from_location_id, to_location_id, status (pending/completed), created_by
- **stock_transfer_items** — id, transfer_id, product_id, quantity

### Inventory UI
- Stock levels table per location with low-stock highlighting
- Stock adjustment form (damage, loss, correction)
- Stock transfer workflow: create → approve → complete
- Low stock alerts dashboard widget

---

## Phase 3: POS Screen

### Sales Data
- **sales** — id, business_id, location_id, customer_id, invoice_number (auto-generated), subtotal, tax, discount, total, payment_status, status (draft/final), created_by, created_at
- **sale_items** — id, sale_id, product_id, quantity, unit_price, discount, total
- **payments** — id, sale_id, method (cash/mpesa/card/credit), amount, reference, created_at

### POS UI (Full-screen mode)
- Left panel: product grid with category tabs + search bar + barcode input field
- Right panel: cart with quantity controls, line discounts, running total
- Bottom bar: payment buttons (Cash, M-Pesa, Card, Split Payment)
- Payment modal: amount tendered, change calculation, receipt preview
- Hold/resume sales (draft status)
- Receipt printing (thermal printer format via browser print)

### Customer Management
- **customers** — id, business_id, name, phone, email, address, balance
- Quick-add customer during sale
- Customer purchase history

---

## Phase 4: Purchases & Expenses

### Purchases
- **suppliers** — id, business_id, name, phone, email, address, balance
- **purchases** — id, business_id, supplier_id, location_id, invoice_number, total, payment_status, status, created_at
- **purchase_items** — id, purchase_id, product_id, quantity, unit_cost, total
- Auto-update inventory on purchase completion

### Expenses
- **expense_categories** — id, business_id, name
- **expenses** — id, business_id, location_id, category_id, amount, description, date, created_by

### UI
- Purchase order form with product selection, supplier, totals
- Expense entry form with category, amount, date
- Lists with filters and status tracking

---

## Phase 5: Basic Accounting & Reports

### Dashboard
- Today's sales total, items sold, profit
- Sales trend chart (daily/weekly/monthly)
- Top selling products
- Low stock alerts
- Recent transactions

### Reports (data tables + charts)
- **Sales Report** — by date range, location, product, customer
- **Purchase Report** — by date range, supplier
- **Expense Report** — by category, date range
- **Profit & Loss** — revenue - COGS - expenses
- **Stock Valuation** — current stock × purchase price per location
- **Trending Products** — most sold by quantity/revenue

### Settings Page
- Business profile (name, logo, currency, tax settings)
- Locations CRUD
- User management (invite, assign roles)
- Payment methods configuration
- Receipt template customization

---

## Design Direction
- **Style**: Feature-rich dashboard — dense data tables, compact spacing, lots of filters and controls
- **Colors**: Professional blue/slate palette — navy sidebar, white content area, blue accent for actions
- **Typography**: Inter for body, clean sans-serif throughout
- **Layout**: Sidebar navigation + top bar with business/location context
- **Tables**: ShadCN data tables with sorting, filtering, pagination
- **Charts**: Recharts for dashboard visualizations

