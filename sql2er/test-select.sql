-- ====================================
-- SQL2ER SELECT 文テストケース集
-- ====================================

-- テスト1: 基本 SELECT（単純なFROM）
-- 期待: SELECT {ID} - USERS テーブル表示
SELECT u.id, u.name, u.email
FROM users u;


-- テスト2: 複数JOIN
-- 期待: SELECT - ORDERS/CUSTOMERS/PRODUCTS テーブル
--       複数の関連線表示
SELECT o.id, c.name, p.title
FROM orders o
INNER JOIN customers c ON o.customer_id = c.id
LEFT JOIN products p ON o.product_id = p.id;


-- テスト3: 複数条件ON（複数行）
-- 期待: ON条件の両カラムが表示される
SELECT *
FROM orders o
INNER JOIN shipments s
  ON o.id = s.order_id
  AND o.user_id = s.user_id;


-- テスト4: サブクエリ + WHERE条件
-- 期待: SELECT {users, sub query order_count}
--       USERS/ORDERS テーブル
--       WHERE から USERS ↔ ORDERS 関連線
SELECT
  u.name,
  u.email,
  (
    SELECT COUNT(*)
    FROM orders o
    WHERE o.user_id = u.id
  ) AS order_count
FROM users u;


-- テスト5: 複数INNER JOIN + サブクエリ
-- 期待: 複数テーブル + サブクエリテーブル
SELECT
  o.id,
  c.name,
  p.title,
  (
    SELECT SUM(amount)
    FROM order_items oi
    WHERE oi.order_id = o.id
  ) AS total_amount
FROM orders o
INNER JOIN customers c ON o.customer_id = c.id
INNER JOIN products p ON o.product_id = p.id;


-- テスト6: LEFT JOIN + WHERE
-- 期待: LEFT JOIN でも関連線表示
--       WHERE条件から追加関系表示
SELECT
  u.id,
  u.name,
  o.order_date
FROM users u
LEFT JOIN orders o
  ON u.id = o.user_id
  AND o.status = 'completed'
WHERE u.active = 1;


-- テスト7: 複雑な3層JOIN
-- 期待: 3つのテーブル間の複合関係を正確に表示
SELECT
  o.order_id,
  c.customer_id,
  i.item_id
FROM orders o
INNER JOIN order_customers oc ON o.order_id = oc.order_id
INNER JOIN customers c ON oc.customer_id = c.customer_id
INNER JOIN order_items oi ON o.order_id = oi.order_id
INNER JOIN items i ON oi.item_id = i.item_id;
