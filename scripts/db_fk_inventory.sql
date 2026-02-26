-- FK inventory + INT/BIGINT migration preflight probes.
-- Usage example:
-- psql -U contextcache -d contextcache_dev -f scripts/db_fk_inventory.sql

\echo '=== FK Graph ==='
SELECT
  con.conname AS fk_name,
  nsp_parent.nspname || '.' || parent.relname AS parent_table,
  a_parent.attname AS parent_column,
  nsp_child.nspname || '.' || child.relname AS child_table,
  a_child.attname AS child_column
FROM pg_constraint con
JOIN pg_class child ON child.oid = con.conrelid
JOIN pg_namespace nsp_child ON nsp_child.oid = child.relnamespace
JOIN pg_class parent ON parent.oid = con.confrelid
JOIN pg_namespace nsp_parent ON nsp_parent.oid = parent.relnamespace
JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON TRUE
JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = ck.ord
JOIN pg_attribute a_child ON a_child.attrelid = child.oid AND a_child.attnum = ck.attnum
JOIN pg_attribute a_parent ON a_parent.attrelid = parent.oid AND a_parent.attnum = fk.attnum
WHERE con.contype = 'f'
ORDER BY parent_table, child_table, fk_name;

\echo '=== Largest Tables (estimated rows) ==='
SELECT
  schemaname || '.' || relname AS table_name,
  n_live_tup AS est_rows
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 50;

\echo '=== Remaining INT4 Primary Keys ==='
SELECT
  n.nspname || '.' || c.relname AS table_name,
  a.attname AS pk_column,
  format_type(a.atttypid, a.atttypmod) AS pk_type
FROM pg_index i
JOIN pg_class c ON c.oid = i.indrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
WHERE i.indisprimary
  AND a.atttypid = 'int4'::regtype
ORDER BY table_name;

\echo '=== Remaining INT4 Foreign Keys ==='
SELECT
  n.nspname || '.' || c.relname AS table_name,
  a.attname AS fk_column,
  format_type(a.atttypid, a.atttypmod) AS fk_type
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN unnest(con.conkey) AS k(attnum) ON TRUE
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
WHERE con.contype = 'f'
  AND a.atttypid = 'int4'::regtype
ORDER BY table_name, fk_column;

\echo '=== Case-insensitive duplicate email check: users ==='
SELECT lower(email) AS email_lower, count(*)
FROM users
GROUP BY lower(email)
HAVING count(*) > 1;

\echo '=== Case-insensitive duplicate email check: auth_users ==='
SELECT lower(email) AS email_lower, count(*)
FROM auth_users
GROUP BY lower(email)
HAVING count(*) > 1;
