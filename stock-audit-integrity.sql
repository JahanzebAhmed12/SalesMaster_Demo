PRAGMA query_only = ON;

SELECT 'current_vs_initial_nonzero' AS check_name, COUNT(*) AS count
FROM (
  SELECT 'regular' AS product_type, id, current_stock, initial_stock FROM regular_products
  UNION ALL SELECT 'non', id, current_stock, initial_stock FROM non_products
) p
WHERE ABS(COALESCE(p.current_stock, 0) - COALESCE(p.initial_stock, 0)) > 0.0001;

SELECT 'current_vs_initial_plus_non_initial_movements_mismatch' AS check_name, COUNT(*) AS count
FROM (
  SELECT 'regular' AS product_type, p.id, COALESCE(p.current_stock,0) AS current_stock,
         COALESCE(p.initial_stock,0) + COALESCE((SELECT SUM(m.quantity) FROM stock_movement m WHERE m.product_id=p.id AND m.product_type='regular' AND COALESCE(m.reference_type,'') <> 'initial_stock'),0) AS derived_stock
  FROM regular_products p
  UNION ALL
  SELECT 'non', p.id, COALESCE(p.current_stock,0),
         COALESCE(p.initial_stock,0) + COALESCE((SELECT SUM(m.quantity) FROM stock_movement m WHERE m.product_id=p.id AND m.product_type='non' AND COALESCE(m.reference_type,'') <> 'initial_stock'),0)
  FROM non_products p
) x
WHERE ABS(current_stock - derived_stock) > 0.01;

SELECT 'duplicate_movement_groups_same_reference_product_type' AS check_name, COUNT(*) AS group_count, COALESCE(SUM(group_rows),0) AS movement_rows
FROM (
  SELECT reference_type, reference_id, product_id, product_type, movement_type, COUNT(*) AS group_rows
  FROM stock_movement
  WHERE reference_id IS NOT NULL
  GROUP BY reference_type, reference_id, product_id, product_type, movement_type
  HAVING COUNT(*) > 1
);

SELECT 'sales_with_repeated_product_lines' AS check_name, COUNT(*) AS sale_product_groups, COALESCE(SUM(line_count),0) AS repeated_line_rows
FROM (
  SELECT sale_id, COALESCE(product_id, -non_product_id) AS product_key, COUNT(*) AS line_count
  FROM sale_item
  GROUP BY sale_id, COALESCE(product_id, -non_product_id)
  HAVING COUNT(*) > 1
);

SELECT 'closing_stock_adjustments_without_reference_id' AS check_name, COUNT(*) AS count
FROM stock_movement
WHERE movement_type='closing_stock_adjustment' AND reference_type='closing_stock' AND reference_id IS NULL;

SELECT 'closing_stock_rows_without_matching_adjustment_movement' AS check_name, COUNT(*) AS count
FROM closing_stock c
WHERE NOT EXISTS (
  SELECT 1 FROM stock_movement m
  WHERE m.product_id=c.product_id AND m.product_type=c.product_type
    AND m.reference_type='closing_stock' AND m.reference_id=c.id
    AND m.movement_type='closing_stock_adjustment'
);

SELECT 'null_movement_dates' AS check_name, COUNT(*) AS count FROM stock_movement WHERE movement_date IS NULL;

SELECT 'sale_reference_movements_without_sale' AS check_name, COUNT(*) AS count
FROM stock_movement m
WHERE m.reference_type='sale' AND m.reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sale s WHERE s.id=m.reference_id);

SELECT 'customer_return_reference_movements_without_return' AS check_name, COUNT(*) AS count
FROM stock_movement m
WHERE m.reference_type='customer_return' AND m.reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM customer_return r WHERE r.id=m.reference_id);

SELECT 'supplier_return_reference_movements_without_return' AS check_name, COUNT(*) AS count
FROM stock_movement m
WHERE m.reference_type='supplier_return' AND m.reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM supplier_return r WHERE r.id=m.reference_id);

SELECT 'dump_reference_movements_without_dump' AS check_name, COUNT(*) AS count
FROM stock_movement m
WHERE m.reference_type='dump' AND m.reference_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dump_entry d WHERE d.id=m.reference_id);

SELECT 'closing_reference_movements_wrong_reference' AS check_name, COUNT(*) AS count
FROM stock_movement m
WHERE m.reference_type='closing_stock' AND (m.reference_id IS NULL OR NOT EXISTS (SELECT 1 FROM closing_stock c WHERE c.id=m.reference_id));

SELECT 'customer_return_status_counts' AS check_name, status, COUNT(*) AS count FROM customer_return GROUP BY status ORDER BY status;
SELECT 'supplier_return_status_counts' AS check_name, status, COUNT(*) AS count FROM supplier_return GROUP BY status ORDER BY status;
SELECT 'sale_status_counts' AS check_name, status, COUNT(*) AS count FROM sale GROUP BY status ORDER BY status;
SELECT 'stock_movement_type_counts' AS check_name, movement_type, COUNT(*) AS count, COALESCE(SUM(quantity),0) AS signed_quantity FROM stock_movement GROUP BY movement_type ORDER BY movement_type;

SELECT 'negative_finalized_sale_items_without_customer_return' AS check_name, COUNT(*) AS count
FROM sale_item i JOIN sale s ON s.id=i.sale_id
WHERE s.status='finalized' AND i.quantity < 0
  AND NOT EXISTS (SELECT 1 FROM customer_return r WHERE r.sale_id=s.id AND r.product_id=COALESCE(i.product_id,i.non_product_id) AND r.product_type=CASE WHEN i.product_id IS NOT NULL THEN 'regular' ELSE 'non' END AND ABS(r.quantity)=ABS(i.quantity));

SELECT 'completed_customer_returns_without_positive_matching_movement' AS check_name, COUNT(*) AS count
FROM customer_return r
WHERE r.status='completed'
  AND NOT EXISTS (
    SELECT 1 FROM stock_movement m
    WHERE m.reference_type='customer_return' AND m.reference_id=r.id
      AND m.product_id=r.product_id AND m.product_type=r.product_type
      AND m.movement_type IN ('customer_return','customer_return_adjustment')
      AND m.quantity > 0
  );

SELECT 'supplier_returns_with_status_and_movement_inconsistency' AS check_name, COUNT(*) AS count
FROM supplier_return r
WHERE NOT EXISTS (
  SELECT 1 FROM stock_movement m
  WHERE m.reference_type='supplier_return' AND m.reference_id=r.id
    AND m.product_id=r.product_id AND m.product_type=r.product_type
    AND m.movement_type IN ('supplier_return','supplier_return_adjustment','supplier_return_rejection','supplier_return_cancellation')
);
