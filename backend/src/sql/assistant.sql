-- ============================================================================
-- 线上手帐集市 · AI 手帐助手（对话落库）
-- ----------------------------------------------------------------------------
-- 为什么需要落库：
--   助手原来是一问一答的无状态接口，刷新就没了。要支持
--     「查看历史对话」  → 需要按用户存会话与消息；
--     「开启新一轮对话」→ 需要显式的会话边界（conversation），
--                       否则新问题会续到上一轮的上下文里。
--
-- 设计要点：
--   * 会话（assistant_conversations）与消息（assistant_messages）分开存，
--     一个会话多条消息，列表页只查会话 + 最后一条预览，点进去再拉消息；
--   * 消息里的 recommendations / intent 用 JSON 存「当时」的结构化结果，
--     这样历史对话里的商品卡能原样还原（即使商品后来改价下架）；
--   * user_id + updated_at 建联合索引：列表按「最近聊的」倒序取，走索引；
--   * 没有外键约束，与项目其它表保持一致，由应用层保证引用完整性。
--
-- 用法（可重复执行）：mysql -u root -p shopping_cart < src/sql/assistant.sql
-- 或 npm run db:init（已包含在本脚本的建表列表里）
-- ============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 对话（一个用户的一轮会话）
--   title：默认取第一条用户消息的前 24 个字，列表里显示
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assistant_conversations (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT       NOT NULL,
    title      VARCHAR(80)  NOT NULL,
    created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_assistant_conversations_user (user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 消息
--   role：user / assistant
--   recommendations / intent：结构化结果的快照（JSON），历史回放用
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assistant_messages (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT      NOT NULL,
    role            VARCHAR(16) NOT NULL COMMENT 'user / assistant',
    content         TEXT        NOT NULL,
    recommendations JSON        NULL,
    intent          JSON        NULL,
    created_at      DATETIME    DEFAULT CURRENT_TIMESTAMP,
    KEY idx_assistant_messages_conversation (conversation_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
