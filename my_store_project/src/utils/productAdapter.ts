/**
 * 商品数据适配层
 * ----------------------------------------------------------------------------
 * 后端 /api/products 的列表项（ProductListItemVO）与首页卡片使用的 Product
 * 字段不完全一样，这里集中做一次转换，组件不用关心数据来自 mock 还是接口。
 *
 * 两边的差异：
 *   - VO 叫 coverImage / sellerAvatarUrl，卡片叫 image / sellerAvatar；
 *   - 卡片有 tags / likedCount / isRecommended 三个「展示用」字段，数据库里没有：
 *     tags 给空数组（角标会退化成「仅剩 N 件」或直接不显示），
 *     likedCount 给 0，isRecommended 由调用方决定（推荐位传 true）；
 *   - rating / sales 现在是真数据：rating 来自 reviews 平均分，
 *     sales 来自未取消订单的件数，不再是 mock 里的固定值。
 */
import type { Category, Product } from '../types'
import type { CategoryVO } from '../types/category'
import type { ProductListItemVO } from '../types/product'

/** 列表 VO → 首页商品卡片 */
export function toProductCard(vo: ProductListItemVO): Product {
  return {
    id: vo.id,
    sellerId: vo.sellerId,
    categoryId: vo.categoryId,
    title: vo.title,
    description: vo.description ?? '',
    price: vo.price,
    stock: vo.stock,
    sales: vo.sales,
    rating: vo.rating,
    likedCount: 0,
    // 数据库没有标签字段，留空即可（卡片会按库存显示角标）
    tags: [],
    // 推荐位由页面自己决定，列表项默认不是推荐
    isRecommended: false,
    // 图片缺失时传空串，ProductThumb 会渲染占位图
    image: vo.coverImage ?? '',
    sellerName: vo.sellerName,
    sellerAvatar: vo.sellerAvatarUrl,
    categoryName: vo.categoryName,
  }
}

/** 分类 VO → 导航用的 Category（丢掉商品数，导航只关心 id / 名称 / 顺序） */
export function toNavCategory(vo: CategoryVO): Category {
  return {
    id: vo.id,
    name: vo.name,
    parentId: vo.parentId,
    sortOrder: vo.sortOrder,
  }
}
