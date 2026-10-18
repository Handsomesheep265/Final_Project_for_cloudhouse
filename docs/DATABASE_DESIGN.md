# 线上手帐集市 - 数据库设计文档


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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BIGINT | 主键ID |
| user_id | BIGINT | 用户ID（关联 users.id） |
| product_id | BIGINT | 商品ID（关联 products.id） |
| quantity | INT | 购买数量 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

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
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

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
    subtotal DECIMAL(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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


