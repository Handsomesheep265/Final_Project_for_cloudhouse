-- ============================================================================
-- 线上手帐集市 · 表结构（MySQL 8.0）—— 用户 / 商品 / 购物车 / 评价 / 收藏
-- 与 docs/DATABASE_DESIGN.md 保持一致，并补上了购物车相关修正：
--   * cart_items 增加 is_selected（勾选状态）与 uk_user_product 唯一索引
--   * favorites 的 uk_user_product 保留（设计文档里已有）
--
-- 订单模块（orders / order_items / payments）已拆分到同目录的 orders.sql，
-- 因为下单要和 cart_items 处于同一个事务，但按模块维护更清楚。
--
-- 用法（在空库上执行，可重复执行，不会删数据）：
--   mysql -u root -p shopping_cart < src/sql/schema.sql
--   mysql -u root -p shopping_cart < src/sql/orders.sql
--   或 npm run db:init  （会按顺序执行两个建表脚本 + 种子数据）
--
-- 说明：设计文档没有加外键约束，这里保持一致，由应用层保证引用完整性。
--       额外补了几个查询索引（封面图/关联查询会用到），不改变表结构语义。
-- ============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 用户（卖家暂时合并进用户表：每个用户都能卖东西）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    nickname      VARCHAR(50)  NOT NULL,
    avatar_url    VARCHAR(500),
    email         VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    bio           VARCHAR(200),
    status        TINYINT DEFAULT 1 COMMENT '1正常 0禁用',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 分类（parent_id = 0 为一级分类）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(50) NOT NULL,
    parent_id  BIGINT DEFAULT 0,
    sort_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 商品
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    seller_id   BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    price       DECIMAL(10, 2) NOT NULL,
    stock       INT DEFAULT 0,
    status      TINYINT DEFAULT 1 COMMENT '1上架 0下架',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_products_category (category_id),
    KEY idx_products_seller (seller_id),
    KEY idx_products_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 商品图片（一个商品多张图，sort_order 小的作为封面）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_images (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    image_url  VARCHAR(500) NOT NULL,
    sort_order INT DEFAULT 0,
    KEY idx_product_images_product (product_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 购物车
--   uk_user_product：同一用户的同一商品只占一行，加购走「累加数量」而不是插入新行
--   is_selected    ：结算勾选状态，用于「选中合计」
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart_items (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    product_id  BIGINT NOT NULL,
    quantity    INT DEFAULT 1,
    is_selected TINYINT DEFAULT 1 COMMENT '1选中 0未选中',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_product (user_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 评价
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    order_id   BIGINT NOT NULL,
    rating     TINYINT NOT NULL,
    content    TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_reviews_product (product_id),
    KEY idx_reviews_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 收藏 / 喜欢
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_product (user_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
