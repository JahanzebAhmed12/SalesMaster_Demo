.headers on
.mode column
.width 36 16
PRAGMA query_only = ON;
SELECT name, type FROM sqlite_master WHERE type IN ('table','index') ORDER BY type, name;
SELECT 'regular_products' AS table_name, COUNT(*) AS rows FROM regular_products
UNION ALL SELECT 'non_products', COUNT(*) FROM non_products
UNION ALL SELECT 'sale', COUNT(*) FROM sale
UNION ALL SELECT 'sale_item', COUNT(*) FROM sale_item
UNION ALL SELECT 'purchase', COUNT(*) FROM purchase
UNION ALL SELECT 'purchase_invoice', COUNT(*) FROM purchase_invoice
UNION ALL SELECT 'purchase_invoice_item', COUNT(*) FROM purchase_invoice_item
UNION ALL SELECT 'stock_movement', COUNT(*) FROM stock_movement
UNION ALL SELECT 'stock_adjustment', COUNT(*) FROM stock_adjustment
UNION ALL SELECT 'dump_entry', COUNT(*) FROM dump_entry
UNION ALL SELECT 'customer_return', COUNT(*) FROM customer_return
UNION ALL SELECT 'supplier_return', COUNT(*) FROM supplier_return
UNION ALL SELECT 'closing_stock', COUNT(*) FROM closing_stock;
SELECT MIN(created_at) AS earliest_movement, MAX(created_at) AS latest_movement,
       SUM(CASE WHEN movement_date IS NULL THEN 1 ELSE 0 END) AS null_movement_dates,
       COUNT(*) AS total_movements
FROM stock_movement;
SELECT MIN(date) AS earliest_sale, MAX(date) AS latest_sale, COUNT(*) AS sales FROM sale;
SELECT MIN(date) AS earliest_closing, MAX(date) AS latest_closing, COUNT(*) AS closing_rows FROM closing_stock;
