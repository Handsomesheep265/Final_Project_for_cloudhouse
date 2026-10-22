/**
 * 登录态启动器 / 401 桥接 / 跨标签页同步
 * ----------------------------------------------------------------------------
 * 这个组件不渲染任何东西，只在路由树里做三件事：
 *
 * 1. 启动：调一次 useAuthStore.bootstrap()，把 localStorage 里的 token 拿去后端确认，
 *    顺便让后端签一个新 token（滑动续期）。
 *
 * 2. 401 桥接：api/client.ts 收到 401 → 这里清登录态 + 跳登录页，
 *    并把「登录后回到哪个页面」写进 ?next=（api/client.ts 不能直接依赖 router）。
 *
 * 3. 跨标签页同步：浏览器只在「别的标签页」改 localStorage 时触发 storage 事件，
 *    监听 journal-market:auth 这个键即可：
 *      - 对方登录 / 续期 → 读出新会话，同步内存状态（不再回写 storage，避免来回触发）；
 *      - 对方退出登录 → 清内存状态。
 *    登录态一变，购物车/收藏这两个「跟着用户走」的 store 也要一起清，
 *    否则会出现「换个号登录，购物车还是上一个人」的错乱。
 */
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ROUTES, loginPath } from '../router/paths'
import { useAuthStore } from '../stores/authStore'
import { useCartStore } from '../stores/cartStore'
import { useFavoritesStore } from '../stores/favoritesStore'
import { setUnauthorizedHandler } from '../utils/authEvents'
import { AUTH_STORAGE_KEY } from '../utils/authSession'

export default function AuthBootstrap() {
  const navigate = useNavigate()
  const location = useLocation()

  // 启动：只跑一次（store 内部也做了去重，StrictMode 双调用不会发两次请求）
  useEffect(() => {
    void useAuthStore.getState().bootstrap()
  }, [])

  // 401 拦截：清登录态 + 跳登录页，把当前地址带进 next
  useEffect(() => {
    setUnauthorizedHandler((message) => {
      useAuthStore.getState().markExpired(message)

      // 已经在登录/注册页就不用再跳了（比如在登录页点了个需要登录的按钮）
      if (location.pathname === ROUTES.login || location.pathname === ROUTES.register) return

      const from = `${location.pathname}${location.search}`
      navigate(loginPath(from), { replace: true })
    })

    return () => setUnauthorizedHandler(null)
  }, [navigate, location.pathname, location.search])

  // 登录态失效（退出 / 跨标签退出 / 401）时，把「跟用户走」的两个 store 清空
  useEffect(() => {
    return useAuthStore.subscribe((state, previous) => {
      if (previous.status === 'authenticated' && state.status === 'anonymous') {
        useCartStore.getState().reset()
        useFavoritesStore.getState().reset()
      }
    })
  }, [])

  // 跨标签页同步：另一个标签登录 / 退出 / 续期后，这个标签立刻跟上
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      // key 为 null 表示对方调用了 localStorage.clear()
      if (event.key !== null && event.key !== AUTH_STORAGE_KEY) return

      const store = useAuthStore.getState()
      if (!event.newValue) {
        store.handleExternalLogout()
        return
      }
      store.syncFromStorage()
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return null
}
