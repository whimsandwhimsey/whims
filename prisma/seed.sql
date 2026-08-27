-- ─────────────────────────────────────────────────────────────
-- Alternative to `npm run db:seed`, for when you don't have Node.js
-- handy (e.g. seeding a fresh Neon database from an iPad).
--
-- HOW TO USE:
--   1. Deploy the schema first (Vercel's build command already runs
--      `prisma migrate deploy`, so just deploy once via Vercel first).
--   2. Open your Neon project -> "SQL Editor" tab.
--   3. Paste this whole file in and click "Run".
--
-- Passwords are already bcrypt-hashed below, so nothing needs to run
-- locally:
--   Admin login    -> username: admin    password: Admin123!
--   Staff login    -> username: staff1   password: Staff123!
--   Customer login -> phone:    6281234567890
--   Pending signup -> Budi Santoso (6281298765432) — try approving it in /admin/customers
-- ─────────────────────────────────────────────────────────────

INSERT INTO "users" (id, username, "passwordHash", name, role, "isActive", "createdAt", "updatedAt")
VALUES
  ('usr_admin_001', 'admin', '$2b$12$nWOLVkOp7G4IOwfHL4nJsuj/l54bSqnut9L6IKqB7hbwwwPKHoFAS', 'Store Owner', 'ADMIN', true, now(), now()),
  ('usr_staff_001', 'staff1', '$2b$12$QcPVJ0ZmHB9FMLeLdgPW7.2GLZiLSxLjZpx8MzHgcQx8c69owTcH6', 'Warehouse Staff', 'STAFF', true, now(), now())
ON CONFLICT (username) DO NOTHING;

INSERT INTO "customers" (id, name, phone, address, notes, status, "createdAt", "updatedAt")
VALUES
  ('cus_001', 'Siti Rahayu', '6281234567890', 'Jl. Kenanga No. 12, Jakarta Selatan', 'Prefers WhatsApp updates.', 'ACTIVE', now(), now()),
  ('cus_002', 'Budi Santoso', '6281298765432', 'Jl. Melati No. 5, Bandung', NULL, 'PENDING', now(), now())
ON CONFLICT (phone) DO NOTHING;

INSERT INTO "books" (id, title, author, isbn, format, "isActive", "createdAt", "updatedAt")
VALUES
  ('book_001', 'Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780143127550', 'PAPERBACK', true, now(), now()),
  ('book_002', 'Homo Deus', 'Yuval Noah Harari', '9780062316097', 'PAPERBACK', true, now(), now())
ON CONFLICT (isbn) DO NOTHING;

INSERT INTO "orders" (
  id, "orderNumber", "customerId", "orderDate", "expectedArrivalDate", status, notes,
  subtotal, "discountTotal", "totalAmount", "totalCogs", profit, "amountPaid", "outstandingBalance",
  "paymentStatus", "createdById", "createdAt", "updatedAt"
)
VALUES (
  'ord_001', 'ORD-2026-000001', 'cus_001', now(), now() + interval '14 days', 'WAITING',
  'Pre-order, pays in two installments.',
  760000, 10000, 760000, 460000, 300000, 0, 760000,
  'UNPAID', 'usr_admin_001', now(), now()
)
ON CONFLICT ("orderNumber") DO NOTHING;

INSERT INTO "order_items" (id, "orderId", "bookId", "bookTitle", quantity, "sellingPrice", cogs, discount, subtotal, "createdAt", "updatedAt")
VALUES
  ('item_001', 'ord_001', 'book_001', 'Sapiens: A Brief History of Humankind', 2, 250000, 150000, 10000, 490000, now(), now()),
  ('item_002', 'ord_001', 'book_002', 'Homo Deus', 1, 270000, 160000, 0, 270000, now(), now())
ON CONFLICT (id) DO NOTHING;
