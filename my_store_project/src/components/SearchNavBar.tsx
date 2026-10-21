import type { FormEvent } from 'react'
import type { Category, Theme } from '../types'
import ThemeToggle from './ThemeToggle'
import { CloseIcon, SearchIcon, SparklesIcon } from './Icons'
import styles from './SearchNavBar.module.css'

export interface SearchNavBarProps {
  categories: Category[]
  activeCategoryId: number
  onCategoryChange: (categoryId: number) => void
  keyword: string
  onKeywordChange: (keyword: string) => void
  /**
   * 提交搜索（回车或点「搜索」）。
   * 不传时只阻止表单默认跳转——首页现在的行为是「输入即筛列表」，
   * 传了之后回车/点按钮会跳到搜索结果页做真实搜索。
   */
  onSearchSubmit?: (keyword: string) => void
  theme: Theme
  onToggleTheme: () => void
}

/**
 * 顶部搜索导航栏
 * ----------------------------------------------------------------------------
 * 承载 README 首页要求的三件事：商品分类入口、商品搜索入口、风格切换。
 * 分类与搜索都是受控组件，状态由 src/pages/Homepage.tsx 统一管理：
 *   - 输入过程中首页列表即时筛选（本地 mock 数据）；
 *   - 回车 / 点「搜索」交给 onSearchSubmit，跳到 /search 搜真实数据。
 */
export default function SearchNavBar({
  categories,
  activeCategoryId,
  onCategoryChange,
  keyword,
  onKeywordChange,
  onSearchSubmit,
  theme,
  onToggleTheme,
}: SearchNavBarProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearchSubmit?.(keyword.trim())
  }

  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        <a className={styles.brand} href="#top" aria-label="手帐集市首页">
          <span className={styles.brandMark}>
            <SparklesIcon size={18} />
          </span>
          <span className={styles.brandText}>
            <strong>手帐集市</strong>
            <em>Journal Bazaar</em>
          </span>
        </a>

        <nav className={styles.categories} aria-label="商品分类">
          {categories.map((category) => {
            const isActive = category.id === activeCategoryId
            return (
              <button
                key={category.id}
                type="button"
                className={isActive ? `${styles.chip} ${styles.chipActive}` : styles.chip}
                aria-pressed={isActive}
                onClick={() => onCategoryChange(category.id)}
              >
                {category.name}
              </button>
            )
          })}
        </nav>

        <form className={styles.search} role="search" onSubmit={handleSubmit}>
          <SearchIcon size={17} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="search"
            value={keyword}
            placeholder="搜索手帐本 / 贴纸 / 胶带…"
            aria-label="搜索商品"
            onChange={(event) => onKeywordChange(event.target.value)}
          />
          {keyword.length > 0 && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => onKeywordChange('')}
              aria-label="清空搜索"
            >
              <CloseIcon size={13} />
            </button>
          )}
          <button type="submit" className={styles.submit}>
            搜索
          </button>
        </form>

        <div className={styles.actions}>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>
    </header>
  )
}
