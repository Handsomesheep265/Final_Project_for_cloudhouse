import type { NavKey } from '../types'
import type { IconComponent } from './Icons'
import { CartIcon, HomeIcon, UserIcon } from './Icons'
import styles from './BottomNavBar.module.css'

interface NavItem {
  key: NavKey
  label: string
  href: string
  icon: IconComponent
}

/**
 * 底部导航栏（README：首页入口 / 购物车入口 / 个人主页入口）
 * ----------------------------------------------------------------------------
 * 当前用 hash 链接占位，避免为了一个页面就引入路由依赖；
 * 接入 React Router 后，把 <a href> 换成 <NavLink to> 即可。
 */
const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: '首页', href: '#top', icon: HomeIcon },
  { key: 'cart', label: '购物车', href: '#cart', icon: CartIcon },
  { key: 'profile', label: '个人主页', href: '#profile', icon: UserIcon },
]

export interface BottomNavBarProps {
  activeKey?: NavKey
  cartCount?: number
}

export default function BottomNavBar({ activeKey = 'home', cartCount = 0 }: BottomNavBarProps) {
  return (
    <nav className={styles.bar} aria-label="底部导航">
      <ul className={styles.list}>
        {NAV_ITEMS.map(({ key, label, href, icon: Icon }) => {
          const isActive = key === activeKey
          const showBadge = key === 'cart' && cartCount > 0

          return (
            <li key={key}>
              <a
                className={isActive ? `${styles.item} ${styles.itemActive}` : styles.item}
                href={href}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className={styles.iconWrap}>
                  <Icon size={19} />
                  {showBadge && (
                    <span className={styles.badge}>{cartCount > 99 ? '99+' : cartCount}</span>
                  )}
                </span>
                <span className={styles.label}>{label}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
