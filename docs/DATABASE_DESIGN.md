# 线上手帐集市 - 数据库设计文档

> 仓库里提供了可直接执行的脚本（都在 `backend/src/sql/`）：
> `schema.sql`（用户 / 商品 / 购物车 / 评价 / 收藏）、`orders.sql`（订单 / 订单明细 / 支付）、`search-index.sql`（商品名 + 昵称的 ngram 全文索引）、`seed.sql`（种子数据）。
> 或在 `backend/` 下运行 `npm run db:init`（读取 `backend/.env`，库不存在时自动创建，三个脚本按 schema → orders → search-index 的顺序执行）。
> 脚本与本文档保持一致，后续改表结构请同步更新两边。

> 为什么订单和购物车在同一个库：下单要在同一个事务里「写 orders + 写 order_items + 清空 cart_items 里已勾选的行」，
> 同库才能保证三件事要么全成功要么全回滚，也才能直接 JOIN 校验。


## 一、模块划分

根据手帐集市的业务特性，数据库设计划分为以下模块：

| 模块 | 核心表 | 说明 |
|---|---|---|
| 用户模块 | `users` | 账号、昵称、头像、个人主页简介 |
| 卖家/店铺模块 | 先合并进 `users` | 假设每个用户都能卖东西，先合并 |
| 商品模块 | `products`, `product_images`, `categories` | 手帐本、贴纸、胶带、印章、素材包等 |
| 购物车模块 | `cart_items` | 用户临时选购的商品 |
| 订单模块 | `orders`, `order_items` | 下单、金额、收货信息、订单明细 |
| 支付模块 | `payments` | 记录支付流水和支付状态 |
| 评价模块 | `reviews` | 买家对商品或订单的评价 |
| 收藏/喜欢模块 | `favorites` | 手帐集市很适合做"喜欢""收藏店铺" |
| 运营/内容模块 | `banners`, `tags` | 首页推荐、手帐风格标签、活动入口 |

## 三、最小表结构

先写张能支撑首页、商品详情、购物车、下单、个人主页等核心功能的数据库表。

### 3.1 用户表 (users)

用户表存储平台注册用户的基本信息，包括账号凭证、头像、个人简介等。

```sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    avatar_url VARCHAR(500),
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    bio VARCHAR(200),
    status TINYINT DEFAULT 1 COMMENT '1正常 0禁用',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| nickname | VARCHAR(50) | 用户昵称 |
| avatar_url | VARCHAR(500) | 头像URL |
| email | VARCHAR(100) | 邮箱（唯一） |
| password_hash | VARCHAR(255) | 密码哈希 |
| bio | VARCHAR(200) | 个人简介 |
| status | TINYINT | 状态：1正常 0禁用 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 3.2 分类表 (categories)

分类表用于管理商品的分类体系，支持一级和二级分类（通过 parent_id 实现层级）。

```sql
CREATE TABLE categories (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    parent_id BIGINT DEFAULT 0,
    sort_order INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| name | VARCHAR(50) | 分类名称 |
| parent_id | BIGINT | 父分类ID，0表示一级分类 |
| sort_order | INT | 排序顺序 |
| created_at | DATETIME | 创建时间 |

### 3.3 商品表 (products)

商品表存储手帐集市中的所有商品信息，关联用户表（卖家）和分类表。

```sql
CREATE TABLE products (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    seller_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock INT DEFAULT 0,
    status TINYINT DEFAULT 1 COMMENT '1上架 0下架',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| seller_id | BIGINT | 卖家ID（关联 users.id） |
| category_id | BIGINT | 分类ID（关联 categories.id） |
| title | VARCHAR(200) | 商品标题 |
| description | TEXT | 商品描述 |
| price | DECIMAL(10,2) | 价格 |
| stock | INT | 库存数量 |
| status | TINYINT | 状态：1上架 0下架 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 3.4 商品图片表 (product_images)

商品图片表用于存储商品的多张图片，支持一张商品对应多张图片的场景。

```sql
CREATE TABLE product_images (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    sort_order INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| product_id | BIGINT | 商品ID（关联 products.id） |
| image_url | VARCHAR(500) | 图片URL |
| sort_order | INT | 排序顺序 |

### 3.5 购物车表 (cart_items)

购物车表记录用户临时选购的商品及数量。

```sql
CREATE TABLE cart_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    quantity INT DEFAULT 1,
    is_selected TINYINT DEFAULT 1 COMMENT '1选中 0未选中',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_product (user_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| user_id | BIGINT | 用户ID（关联 users.id） |
| product_id | BIGINT | 商品ID（关联 products.id） |
| quantity | INT | 购买数量 |
| is_selected | TINYINT | 是否勾选：1选中 0未选中（用于“选中合计”） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

> 注 1：`(user_id, product_id)` 建立了唯一索引 `uk_user_product`，保证同一用户的同一商品在购物车里只占一行，
> 避免前端重复加购时插入多行、导致数量与合计金额重复计算。
> 加购直接用 upsert 累加数量即可（MySQL 8.0.19+ 的行别名写法）：
>
> ```sql
> INSERT INTO cart_items (user_id, product_id, quantity) VALUES (1, 3, 2) AS new
> ON DUPLICATE KEY UPDATE
>     quantity = cart_items.quantity + new.quantity,
>     is_selected = 1,
>     updated_at = CURRENT_TIMESTAMP;
> ```
>
> 若目标环境是 MySQL 8.0.19 之前的版本，把别名写法换成 `quantity = quantity + VALUES(quantity)`。
>
> 注 2：`is_selected` 只服务于购物车结算勾选，下单时不必写入 `order_items`；
> 提交订单后该行会被删除，状态无需回写。

### 3.6 订单表 (orders)

订单表记录用户的下单信息，包括订单号、金额、收货地址等。

```sql
CREATE TABLE orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(64) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'CREATED',
    receiver_name VARCHAR(50),
    receiver_phone VARCHAR(20),
    receiver_address VARCHAR(300),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_order_no (order_no),
    KEY idx_orders_user_created (user_id, created_at),
    KEY idx_orders_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 注：`backend/src/sql/orders.sql` 里把唯一约束显式命名为 `uk_order_no`，
> 并用 `idx_orders_user_created(user_id, created_at)` 支撑「我的订单」按时间倒序分页
> （复合索引前缀即 `user_id`，不需要再单独建 `idx_orders_user`），另加 `idx_orders_status` 便于按状态筛选。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| order_no | VARCHAR(64) | 订单号（唯一） |
| user_id | BIGINT | 下单用户ID |
| total_amount | DECIMAL(10,2) | 订单总金额 |
| status | VARCHAR(20) | 订单状态（CREATED/PAYED/SHIPPED/COMPLETED/CANCELED） |
| receiver_name | VARCHAR(50) | 收货人姓名 |
| receiver_phone | VARCHAR(20) | 收货人电话 |
| receiver_address | VARCHAR(300) | 收货地址 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 3.7 订单明细表 (order_items)

订单明细表记录每笔订单中包含的具体商品信息。

```sql
CREATE TABLE order_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    product_title VARCHAR(200) NOT NULL,
    product_image VARCHAR(500),
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    KEY idx_order_items_order (order_id),
    KEY idx_order_items_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 注：`idx_order_items_order` 用于「按订单查明细」，`idx_order_items_product` 用于商品维度的统计/评价关联。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| order_id | BIGINT | 订单ID（关联 orders.id） |
| product_id | BIGINT | 商品ID（关联 products.id） |
| product_title | VARCHAR(200) | 商品标题（冗余快照） |
| product_image | VARCHAR(500) | 商品图片（冗余快照） |
| quantity | INT | 购买数量 |
| unit_price | DECIMAL(10,2) | 单价 |
| subtotal | DECIMAL(10,2) | 小计（单价 x 数量） |

### 3.8 支付表 (payments)

支付表记录每笔订单的支付流水和支付状态。

```sql
CREATE TABLE payments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    pay_no VARCHAR(64) NOT NULL UNIQUE,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_pay_no (pay_no),
    KEY idx_payments_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| order_id | BIGINT | 订单ID（关联 orders.id） |
| pay_no | VARCHAR(64) | 支付流水号（唯一） |
| amount | DECIMAL(10,2) | 支付金额 |
| status | VARCHAR(20) | 支付状态（PENDING/SUCCESS/FAILED） |
| created_at | DATETIME | 创建时间 |

### 3.9 评价表 (reviews)

评价表记录买家对商品或订单的评价内容。

```sql
CREATE TABLE reviews (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    order_id BIGINT NOT NULL,
    rating TINYINT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| user_id | BIGINT | 评价用户ID |
| product_id | BIGINT | 被评价商品ID |
| order_id | BIGINT | 关联订单ID |
| rating | TINYINT | 评分（1-5星） |
| content | TEXT | 评价内容 |
| created_at | DATETIME | 创建时间 |

### 3.10 收藏表 (favorites)

收藏表记录用户对商品的收藏/喜欢操作。

```sql
CREATE TABLE favorites (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_product (user_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| user_id | BIGINT | 用户ID |
| product_id | BIGINT | 商品ID |
| created_at | DATETIME | 收藏时间 |

> 注：`(user_id, product_id)` 设置了唯一索引，防止重复收藏。

### 3.11 全文索引（首页搜索用）

首页搜索框要同时搜「商品名」和「店铺名」，这两个字段都是中文。MySQL 默认的全文解析器按空格/标点切词，一整串中文会被当成一个词，几乎搜不到东西，所以两张表的全文索引都指定了 `ngram` 解析器（MySQL 5.7+ 内置，8.0 默认 ACTIVE），按 `ngram_token_size`（默认 2）切成二元组。

```sql
ALTER TABLE products ADD FULLTEXT KEY ft_products_title (title) WITH PARSER ngram;
ALTER TABLE users    ADD FULLTEXT KEY ft_users_nickname (nickname) WITH PARSER ngram;
```

| 表 | 索引 | 字段 | 用途 |
|---|---|---|---|
| products | `ft_products_title` | title | 商品名搜索 |
| users | `ft_users_nickname` | nickname | 店铺 / 用户搜索 |

> 注 1：脚本在 `backend/src/sql/search-index.sql`，由 `npm run db:init` 在 `schema.sql`、`orders.sql` 之后执行。MySQL 不支持 `ADD FULLTEXT IF NOT EXISTS`，脚本里先查 `information_schema.statistics`，已存在就跳过，可重复执行。
>
> 注 2：查询用 `MATCH(title) AGAINST(? IN BOOLEAN MODE)`，`EXPLAIN` 的 `type=fulltext`、`key=ft_products_title`；`MATCH` 的分数可直接用于「相关度排序」。
>
> 注 3：`ngram_token_size=2` 时单字查询（如「纸」）不会命中，所以搜索接口至少要 2 个字符，service 层负责校验；短语搜索用双引号（`"手帐本"`）。
>
> 注 4：`description` 是长文本，后续如果想让描述也参与搜索，再给它单独加 `ft_products_description` 即可（不必改现有索引）。

## 四、表关系说明

```
users 1----* products (seller_id)
users 1----* cart_items (user_id)
users 1----* orders (user_id)
users 1----* reviews (user_id)
users 1----* favorites (user_id)

categories 1----* products (category_id)

products 1----* product_images (product_id)
products 1----* cart_items (product_id)
products 1----* order_items (product_id)
products 1----* reviews (product_id)
products 1----* favorites (product_id)

orders 1----* order_items (order_id)
orders 1----* payments (order_id)
```

## 五、初始化数据示例

### 5.1 分类初始化

```sql
INSERT INTO categories (name, parent_id) VALUES
('手帐本', 0),
('贴纸', 0),
('胶带', 0),
('印章', 0),
('笔类', 0),
('素材包', 0);
```

### 5.2 商品初始化（部分示例）

```sql
INSERT INTO products (seller_id, category_id, title, description, price, stock, status) VALUES
(1, 1, '复古牛皮纸手帐本', 'A6尺寸，120g无酸纸，适合钢笔书写', 39.90, 50, 1),
(1, 1, '每日计划手帐本', '含日程页、打卡页和月计划页', 45.00, 30, 1),
(2, 2, '四季风景贴纸套装', '40张切膜贴纸，和纸材质', 15.50, 200, 1),
(2, 2, '咖啡主题手帐贴纸', '适合复古风手帐排版', 12.80, 150, 1),
(3, 3, '莫兰迪和纸胶带套装', '6卷装，低饱和配色', 45.00, 80, 1),
(3, 3, '复古票据胶带', '适合拼贴和手帐装饰', 9.90, 300, 1),
(4, 4, '木质手帐印章套装', '含日期、天气、心情印章', 29.90, 60, 1),
(5, 5, '针管笔套装', '0.05-0.8mm，适合手绘线稿', 35.00, 100, 1),
(5, 5, '双头马克笔12色', '适合手帐标题和边框', 42.00, 70, 1),
(6, 6, '电子手帐素材包', 'GoodNotes可用，含日程模板', 9.90, 999, 1),
(1, 1, '旅行手帐本', '轻便随身款，适合外出记录', 49.00, 40, 1),
(2, 2, '食物主题贴纸', '奶茶、蛋糕、便当图案', 13.50, 180, 1),
(3, 3, '格子纹和纸胶带', '适合边框装饰', 8.50, 220, 1),
(4, 4, '日期印章', '可调节年月日', 19.90, 90, 1),
(6, 6, '手帐排版模板包', '含周计划、月计划、打卡页', 12.00, 500, 1);
```


