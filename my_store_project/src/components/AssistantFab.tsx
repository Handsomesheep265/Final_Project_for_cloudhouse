import { useLocation, useNavigate } from 'react-router-dom'
import { ROUTES } from '../router/paths'
import { SparklesIcon } from './Icons'
import styles from './AssistantFab.module.css'

/**
 * 有「固定底部操作条」的页面（购物车结算条、结算页提交条、商品详情加购条、订单详情操作条）。
 * 这些页面的操作条在 bottom: 104px 一带，悬浮按钮要抬高，避免盖住主按钮。
 * 用正则而不是枚举具体 id：/products/12、/orders/2026… 都要算进来。
 */
const BOTTOM_BAR_PATTERN = /^\/(cart|checkout)$|^\/products\/[^/]+$|^\/orders\/[^/]+$/

/**
 * AI 手帐助手 · 全局悬浮入口
 * ----------------------------------------------------------------------------
 * 挂在 RootLayout 里（和 <Outlet/> 同级），所以不管切到首页、搜索、个人主页
 * 还是登录页，它都在；只有聊天页本身会隐藏（避免和页面内的输入框抢位置）。
 *
 * 点击 = 跳到 /assistant 聊天页（用路由而不是弹层：
 * 这样聊天页可以有自己的深链接，返回键也符合直觉）。
 */
export default function AssistantFab() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // 已经在聊天页里了，就不用再显示入口
  if (pathname === ROUTES.assistant) return null

  const raised = BOTTOM_BAR_PATTERN.test(pathname)

  return (
    <button
      type="button"
      className={raised ? `${styles.fab} ${styles.fabRaised}` : styles.fab}
      onClick={() => navigate(ROUTES.assistant)}
      aria-label="打开 AI 手帐助手"
      title="AI 手帐助手"
    >
      <SparklesIcon size={22} />
    </button>
  )
}
