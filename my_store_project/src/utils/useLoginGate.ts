/**
 * 「需要登录才能做」的操作统一入口
 * ----------------------------------------------------------------------------
 * 首页爱心、商品详情收藏/加购、搜索结果加购……都属于「点了才知道要登录」，
 * 与其把请求发出去等后端 401，不如在点击时就拦下来：
 *   - 已登录 → 返回 true，调用方继续原来的逻辑；
 *   - 未登录 → 跳 /login?next=<当前地址>，并把操作名带进 state，
 *     登录页会显示「登录后即可收藏商品」这类提示。
 *
 * 这是「前端拦截」，后端仍然会对购物车/订单/收藏接口返回 401 —— 双层保险，
 * 直接调接口（Postman、旧版本页面）也绕不过去。
 */
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { loginPath } from '../router/paths'
import { useAuthStore } from '../stores/authStore'

export type LoginGate = (intent: string) => boolean

export function useLoginGate(): LoginGate {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(
    (intent: string): boolean => {
      if (useAuthStore.getState().status === 'authenticated') return true

      const from = `${location.pathname}${location.search}`
      navigate(loginPath(from), { state: { intent } })
      return false
    },
    [navigate, location.pathname, location.search],
  )
}
