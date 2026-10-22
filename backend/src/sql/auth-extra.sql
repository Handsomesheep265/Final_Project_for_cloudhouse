-- ============================================================================
-- 线上手帐集市 · 登录态安全相关表（JWT 黑名单 / 找回密码）
-- ----------------------------------------------------------------------------
-- JWT 本身是无状态的：签出去就认，服务端「忘记」不了。要支持
--   1. 退出登录后旧 token 立即失效；
--   2. 重置密码后把该用户所有设备上的旧 token 全部作废；
-- 就需要在数据库里记两样东西：
--
--   revoked_tokens       单条 token 的黑名单（登出时写入），存 SHA-256 指纹而非原文
--   user_token_epochs    每个用户的「凭证时间线」（重置密码时写入），
--                        iat 早于 valid_after 的 token 一律视为失效
--   password_reset_tokens 一次性重置令牌（只存指纹，30 分钟内有效且只能用一次）
--
-- 用法（可重复执行）：mysql -u root -p shopping_cart < src/sql/auth-extra.sql
-- 或 npm run db:init（已包含在本脚本的建表列表里）
-- ============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 退出登录后的 token 黑名单
--   token_hash ：token 原文的 SHA-256（64 位十六进制），不存原文
--   expires_at ：token 自己的过期时间；过了这个时间记录就没有意义了，
--                写入时会顺手清理过期行，表不会无限增长
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revoked_tokens (
    token_hash CHAR(64)    NOT NULL PRIMARY KEY,
    user_id    BIGINT      NOT NULL,
    expires_at DATETIME    NOT NULL,
    created_at DATETIME    DEFAULT CURRENT_TIMESTAMP,
    KEY idx_revoked_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 用户级凭证时间线（重置密码 / 「退出所有设备」）
--   只保留最新一行：valid_after 之后的 token 才有效
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_token_epochs (
    user_id     BIGINT   NOT NULL PRIMARY KEY,
    valid_after DATETIME NOT NULL,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 找回密码令牌
--   used_at 非空表示已被用过（一次性）；expires_at 之后无效
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT    NOT NULL,
    token_hash CHAR(64)  NOT NULL,
    expires_at DATETIME  NOT NULL,
    used_at    DATETIME  NULL,
    created_at DATETIME  DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_password_reset_token (token_hash),
    KEY idx_password_reset_user (user_id, used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
