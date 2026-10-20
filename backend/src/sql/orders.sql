-- ============================================================================
-- 线上手帐集市 · 订单模块建表（MySQL 8.0）
-- 对应 docs/DATABASE_DESIGN.md 的 3.6 orders / 3.7 order_items / 3.8 payments
--
-- 为什么和购物车同库（shopping_cart）而不是单独建库：
--   下单要做的事是「写 orders + 写 order_items + 清空 cart_items 里已勾选的行」，
--   三件事必须在同一个事务里，要么全成功要么全回滚；
--   订单号/明细/购物车在同库才能保证这一点，也才能直接 JOIN 校验。
--
-- 用法（幂等：可重复执行，不删数据）：
--   npm run db:init                              # 先 schema.sql 再本文件
--   mysql -u root -p shopping_cart < src/sql/orders.sql
--
-- 与设计文档的差异（都是索引层面的优化，字段完全一致）：
--   * orders.order_no 的唯一约束显式命名为 uk_order_no
--   * orders 用 idx_orders_user_created(user_id, created_at) 替代 idx_orders_user，
--     支撑「我的订单」按时间倒序分页（复合索引前缀即 user_id）
--   * orders 增加 idx_orders_status，便于按状态筛选/扫描超时未支付订单
--   * 设计文档没有外键约束，这里保持一致，由应用层保证引用完整性
-- ============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 订单主表
-- 金额、状态、收货信息都在下单那一刻写入；商品内容另存 order_items 快照
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_no         VARCHAR(64) NOT NULL COMMENT '订单号，服务端生成（如 20261020 + 随机段），对外展示用',
    user_id          BIGINT NOT NULL COMMENT '下单用户',
    total_amount     DECIMAL(10, 2) NOT NULL COMMENT '订单总金额（下单时快照）',
    status           VARCHAR(20) NOT NULL DEFAULT 'CREATED'
                     COMMENT 'CREATED/PAYED/SHIPPED/COMPLETED/CANCELED',
    receiver_name    VARCHAR(50) COMMENT '收货人',
    receiver_phone   VARCHAR(20) COMMENT '收货电话',
    receiver_address VARCHAR(300) COMMENT '收货地址',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_order_no (order_no),
    KEY idx_orders_user_created (user_id, created_at),
    KEY idx_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 订单明细
-- 冗余保存下单时的商品标题/图片/单价：商品之后改价改名都不影响历史订单
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id      BIGINT NOT NULL,
    product_id    BIGINT NOT NULL,
    product_title VARCHAR(200) NOT NULL COMMENT '商品标题快照',
    product_image VARCHAR(500) COMMENT '商品图快照',
    quantity      INT NOT NULL COMMENT '购买数量',
    unit_price    DECIMAL(10, 2) NOT NULL COMMENT '下单时单价',
    subtotal      DECIMAL(10, 2) NOT NULL COMMENT '小计 = unit_price × quantity',
    KEY idx_order_items_order (order_id),
    KEY idx_order_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 支付流水（订单模块的一部分，结算后接入支付时使用）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id   BIGINT NOT NULL,
    pay_no     VARCHAR(64) NOT NULL COMMENT '支付流水号',
    amount     DECIMAL(10, 2) NOT NULL,
    status     VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/SUCCESS/FAILED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_pay_no (pay_no),
    KEY idx_payments_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
