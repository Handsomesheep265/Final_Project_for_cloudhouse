import { NavLink } from 'react-router-dom'
import type { NavKey } from '../types'
import type { RoutePath } from '../router/paths'
import { ROUTES } from '../router/paths'
import type { IconComponent } from './Icons'
import { CartIcon, HomeIcon, UserIcon } from './Icons'
import styles from './BottomNavBar.module.css'

interface BaseNavItem {
  key: NavKey
  label: string
  icon: IconComponent
}

/**
 * 三个入口都已实现，全部走 React Router 跳转；
 * NavItem 保留了 href 这一支，方便以后接入外部链接（如帮助中心）。
 */
type NavItem = BaseNavItem &
  ({ to: RoutePath; href?: never } | { href: string; to?: never })

/**
 * 底部导航栏（README：首页入口 / 购物车入口 / 个人主页入口）
 * 高亮状态由当前路由决定，不需要外部再传 activeKey。
 */
const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: '首页', icon: HomeIcon, to: ROUTES.home },
  { key: 'cart', label: '购物车', icon: CartIcon, to: ROUTES.cart },
  { key: 'profile', label: '个人主页', icon: UserIcon, to: ROUTES.profile },
]

export interface BottomNavBarProps {
  cartCount?: number
}

export default function BottomNavBar({ cartCount = 0 }: BottomNavBarProps) {
  return (
    <nav className={styles.bar} aria-label="底部导航">
      <ul className={styles.list}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const showBadge = item.key === 'cart' && cartCount > 0

          const content = (
            <>
              <span className={styles.iconWrap}>
                <Icon size={19} />
                {showBadge && (
                  <span className={styles.badge}>{cartCount > 99 ? '99+' : cartCount}</span>
                )}
              </span>
              <span className={styles.label}>{item.label}</span>
            </>
          )

          return (
            <li key={item.key}>
              {item.to !== undefined ? (
                <NavLink
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    isActive ? `${styles.item} ${styles.itemActive}` : styles.item
                  }
                >
                  {content}
                </NavLink>
              ) : (
                <a className={styles.item} href={item.href}>
                  {content}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
