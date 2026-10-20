-- ============================================================================
-- 线上手帐集市 · 种子数据
-- 数据内容取自 docs/DATABASE_DESIGN.md 的「初始化数据示例」，
-- 商品 id 与前端 my_store_project/src/utils/mockData.ts 保持一致（1 ~ 15），
-- 方便前后端对照调试。
--
-- 注意：本文件不是幂等的（图片表没有唯一键），请通过 npm run db:init 执行，
--       脚本会在 products 非空时自动跳过，避免重复写入。
-- ============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 卖家（id 1~6，对应商品表的 seller_id）
-- 密码哈希为占位值：登录/注册功能尚未实现，接入 BCrypt 后请重新生成
-- ---------------------------------------------------------------------------
INSERT INTO users (id, nickname, avatar_url, email, password_hash, bio, status) VALUES
(1, '纸间手作',   'avatars/avatar-1.png', 'seller1@example.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', '做能写很久的纸', 1),
(2, '小满贴纸铺', 'avatars/avatar-2.png', 'seller2@example.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', '和纸贴纸专门店', 1),
(3, '卷卷胶带研究所', 'avatars/avatar-3.png', 'seller3@example.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', '低饱和配色爱好者', 1),
(4, '木木印章工房', 'avatars/avatar-4.png', 'seller4@example.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', '手刻木质印章', 1),
(5, '一笔一画文具', 'avatars/avatar-5.png', 'seller5@example.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', '笔类选品', 1),
(6, '电子手帐研究所', 'avatars/avatar-6.png', 'seller6@example.com', '$2a$10$dXJ3SW6G7P50lGmMkkmwe.20cQQubK3.HZWzG3YB1tlRy.fqvM/BG', 'GoodNotes 模板', 1);

-- ---------------------------------------------------------------------------
-- 分类
-- ---------------------------------------------------------------------------
INSERT INTO categories (id, name, parent_id, sort_order) VALUES
(1, '手帐本', 0, 1),
(2, '贴纸',   0, 2),
(3, '胶带',   0, 3),
(4, '印章',   0, 4),
(5, '笔类',   0, 5),
(6, '素材包', 0, 6);

-- ---------------------------------------------------------------------------
-- 商品（价格 / 库存取自设计文档；id 与前端 mock 对齐）
-- ---------------------------------------------------------------------------
INSERT INTO products (id, seller_id, category_id, title, description, price, stock, status) VALUES
(1,  1, 1, '复古牛皮纸手帐本', 'A6 尺寸，120g 无酸纸，适合钢笔书写', 39.90,  50, 1),
(2,  1, 1, '每日计划手帐本',   '含日程页、打卡页和月计划页',        45.00,  30, 1),
(3,  2, 2, '四季风景贴纸套装', '40 张切膜贴纸，和纸材质',           15.50, 200, 1),
(4,  2, 2, '咖啡主题手帐贴纸', '适合复古风手帐排版',               12.80, 150, 1),
(5,  3, 3, '莫兰迪和纸胶带套装', '6 卷装，低饱和配色',              45.00,  80, 1),
(6,  3, 3, '复古票据胶带',     '适合拼贴和手帐装饰',                9.90,  300, 1),
(7,  4, 4, '木质手帐印章套装', '含日期、天气、心情印章',           29.90,  60, 1),
(8,  5, 5, '针管笔套装',       '0.05-0.8mm，适合手绘线稿',         35.00, 100, 1),
(9,  5, 5, '双头马克笔 12 色', '适合手帐标题和边框',               42.00,  70, 1),
(10, 6, 6, '电子手帐素材包',   'GoodNotes 可用，含日程模板',         9.90, 999, 1),
(11, 1, 1, '旅行手帐本',       '轻便随身款，适合外出记录',          49.00,  40, 1),
(12, 2, 2, '食物主题贴纸',     '奶茶、蛋糕、便当图案',              13.50, 180, 1),
(13, 3, 3, '格子纹和纸胶带',   '适合边框装饰',                       8.50, 220, 1),
(14, 4, 4, '日期印章',         '可调节年月日',                      19.90,  90, 1),
(15, 6, 6, '手帐排版模板包',   '含周计划、月计划、打卡页',          12.00, 500, 1);

-- ---------------------------------------------------------------------------
-- 商品图片
-- 大部分商品只有一张封面（sort_order = 0）。
-- 商品 1 / 3 特意补了一张 sort_order = 1 的图，并且先插入它，
-- 用来验证仓储层「取 sort_order 最小的那张作为封面」的排序逻辑真的生效。
-- 图片路径沿用 my_store_project/src/assets/README.md 的约定；
-- 正式环境应替换为完整 URL（如 CDN 地址）。
-- ---------------------------------------------------------------------------
INSERT INTO product_images (product_id, image_url, sort_order) VALUES
(1, 'products/retro-kraft-notebook-2.png', 1),
(1, 'products/retro-kraft-notebook.png',   0),
(2, 'products/daily-planner-notebook.png', 0),
(3, 'products/four-seasons-stickers-2.png', 1),
(3, 'products/four-seasons-stickers.png',   0),
(4, 'products/coffee-stickers.png',         0),
(5, 'products/morandi-washi-set.png',       0),
(6, 'products/retro-receipt-tape.png',      0),
(7, 'products/wooden-stamp-set.png',        0),
(8, 'products/fineliner-pens.png',          0),
(9, 'products/dual-tip-markers.png',        0),
(10, 'products/digital-material-pack.png',  0),
(11, 'products/travel-notebook.png',        0),
(12, 'products/food-stickers.png',          0),
(13, 'products/grid-washi-tape.png',        0),
(14, 'products/date-stamp.png',             0),
(15, 'products/layout-template-pack.png',   0);
