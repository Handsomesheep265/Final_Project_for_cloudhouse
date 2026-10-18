# src/assets 图片放置说明

首页 `src/pages/Homepage.jsx` 只在演示数据里记录**相对路径**（见 `src/utils/mockData.js`），
图片由 `src/utils/assetUrl.js` 用 `import.meta.glob` 自动收集。

- 文件名、扩展名必须与下表**完全一致**，否则会显示占位图（不会报错，也不会影响构建）。
- 建议尺寸：商品图 **800 × 1000 px**（4:5 竖图，WebP/PNG 均可，单张 ≤ 300 KB）；
  头像 **96 × 96 px**（正方形）。
- 想换文件名时，同步修改 `src/utils/mockData.js` 里的 `image` / `sellerAvatar` 字段即可。
- 只要改文件名或新增图片，Vite 会自动重新导入，无需在组件里 `import`。

## 目录结构

```
src/assets/
├─ products/   商品主图
└─ avatars/    卖家头像
```

## 一、商品图 `src/assets/products/`

| 文件名（固定）                        | 对应商品           | 分类   |
| ------------------------------------- | ------------------ | ------ |
| `retro-kraft-notebook.png`            | 复古牛皮纸手帐本   | 手帐本 |
| `daily-planner-notebook.png`          | 每日计划手帐本     | 手帐本 |
| `four-seasons-stickers.png`           | 四季风景贴纸套装   | 贴纸   |
| `coffee-stickers.png`                 | 咖啡主题手帐贴纸   | 贴纸   |
| `morandi-washi-set.png`               | 莫兰迪和纸胶带套装 | 胶带   |
| `retro-receipt-tape.png`              | 复古票据胶带       | 胶带   |
| `wooden-stamp-set.png`                | 木质手帐印章套装   | 印章   |
| `fineliner-pens.png`                  | 针管笔套装         | 笔类   |
| `dual-tip-markers.png`                | 双头马克笔 12 色   | 笔类   |
| `digital-material-pack.png`           | 电子手帐素材包     | 素材包 |
| `travel-notebook.png`                 | 旅行手帐本         | 手帐本 |
| `food-stickers.png`                   | 食物主题贴纸       | 贴纸   |
| `grid-washi-tape.png`                 | 格子纹和纸胶带     | 胶带   |
| `date-stamp.png`                      | 日期印章           | 印章   |
| `layout-template-pack.png`            | 手帐排版模板包     | 素材包 |

## 二、卖家头像 `src/assets/avatars/`

| 文件名（固定）      | 对应卖家         |
| ------------------- | ---------------- |
| `avatar-1.png`      | 纸间手作         |
| `avatar-2.png`      | 小满贴纸铺       |
| `avatar-3.png`      | 卷卷胶带研究所   |
| `avatar-4.png`      | 木木印章工房     |
| `avatar-5.png`      | 一笔一画文具     |
| `avatar-6.png`      | 电子手帐研究所   |

头像缺失时会自动用卖家昵称首字生成字母头像，可以不急着放。

## 三、补充说明

- `.gitkeep` 只是为了占住空目录，图片补齐后可以删掉。
- 该目录下的所有图片都会被 `assetUrl.js` 的 `import.meta.glob` 打包进来，
  所以请只放首页真正用到的图，避免无谓增大产物体积。
- 如果后续想加首页轮播 banner（对应数据库 `banners` 表），建议放在
  `src/assets/banner/` 下，例如 `src/assets/banner/hero-banner.jpg`。
