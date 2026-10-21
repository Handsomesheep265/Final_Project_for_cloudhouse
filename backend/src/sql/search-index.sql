-- ============================================================================
-- 线上手帐集市 · 搜索用全文索引（MySQL 8.0）
-- ----------------------------------------------------------------------------
-- 首页搜索框要同时搜「商品名」和「店铺名」，这两个字段都是中文，
-- 而 MySQL 默认的全文解析器按空格/标点切词，一整串中文会被当成一个词，几乎搜不到。
-- 所以这里显式指定 ngram 解析器（MySQL 5.7+ 内置，8.0 默认 ACTIVE）：
--   它按 ngram_token_size（默认 2）把中文切成二元组，
--   「复古牛皮纸手帐本」→ 复古 / 古牛 / 牛皮 / 皮纸 / 纸手 / 手帐 / 帐本，
--   搜「手帐」能命中，搜「手帐本」这种更长的词也能命中。
--
-- 建的索引：
--   products.ft_products_title  (title)    WITH PARSER ngram   商品名
--   users.ft_users_nickname     (nickname) WITH PARSER ngram   店铺 / 用户昵称
--
-- 用法（幂等，可重复执行，不删数据）：
--   mysql -u root -p shopping_cart < src/sql/search-index.sql
--   或 npm run db:init（按 schema → orders → search-index 的顺序执行）
--
-- 注意：
--   * MySQL 不支持 ADD FULLTEXT IF NOT EXISTS，这里先查 information_schema
--     判断索引是否已存在，再用动态 SQL 执行，保证脚本可以重复跑。
--   * ngram_token_size=2 时单字查询（如「纸」）不会命中 —— 搜索接口
--     至少要 2 个字符，service 层负责校验并给出友好提示。
--   * 全文索引依赖 InnoDB 的 FTS 索引表，加完索引已有数据会自动重建。
-- ============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 商品名全文索引（products.title）
-- ---------------------------------------------------------------------------
SET @has_products_title := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'products'
      AND index_name = 'ft_products_title'
);

SET @ddl := IF(
    @has_products_title = 0,
    'ALTER TABLE products ADD FULLTEXT KEY ft_products_title (title) WITH PARSER ngram',
    'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 店铺 / 用户昵称全文索引（users.nickname）
-- ---------------------------------------------------------------------------
SET @has_users_nickname := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'users'
      AND index_name = 'ft_users_nickname'
);

SET @ddl := IF(
    @has_users_nickname = 0,
    'ALTER TABLE users ADD FULLTEXT KEY ft_users_nickname (nickname) WITH PARSER ngram',
    'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 结果确认：应该能看到两行 FULLTEXT
-- ---------------------------------------------------------------------------
SELECT TABLE_NAME AS '表', INDEX_NAME AS '索引', GROUP_CONCAT(COLUMN_NAME) AS '字段', INDEX_TYPE AS '类型'
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND index_name IN ('ft_products_title', 'ft_users_nickname')
GROUP BY TABLE_NAME, INDEX_NAME, INDEX_TYPE;
