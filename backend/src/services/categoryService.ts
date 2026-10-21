/**
 * 分类服务层（Service）
 * ----------------------------------------------------------------------------
 * 分类是公开数据、没有写操作，所以这一层很薄：
 *   1. 查分类列表（按 sortOrder 排好，直接给导航栏用）；
 *   2. 查全站在售商品数（导航里「全部」后面的数字）；
 *   3. 实体 → VO。
 *
 * 「按分类筛选商品」不在这里，而是在 productService.listProducts（它要排序和分页）。
 */
import { categoryRepository, CategoryRepository } from '../repositories/categoryRepositories'
import type { CategoryEntity } from '../types/category.entity'
import type { CategoryListVO, CategoryVO } from '../types/category.vo'

function toCategoryVO(entity: CategoryEntity): CategoryVO {
  return {
    id: entity.id,
    name: entity.name,
    parentId: entity.parentId,
    sortOrder: entity.sortOrder,
    productCount: entity.productCount,
  }
}

export class CategoryService {
  constructor(private readonly repo: CategoryRepository) {}

  /** GET /api/categories —— 全部分类 + 全站在售商品数 */
  async listCategories(): Promise<CategoryListVO> {
    const [categories, productTotal] = await Promise.all([
      this.repo.findAll(),
      this.repo.countAllProducts(),
    ])

    return {
      list: categories.map(toCategoryVO),
      total: categories.length,
      productTotal,
    }
  }
}

/** 默认实例：仓储层用 src/config/database.ts 的连接池；单元测试可 new CategoryService(fakeRepo) */
export const categoryService = new CategoryService(categoryRepository)
