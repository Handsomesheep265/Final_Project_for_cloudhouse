/**
 * 需要登录才能访问的页面守卫
 * ----------------------------------------------------------------------------
 * 浏览商品（首页 / 详情 / 搜索）是公开的；购物车、结算、订单、个人主页
 * 都是「某个人的数据」，未登录时直接跳登录页，并把当前地址记进 ?next=，
 * 登录成功后自动回到这里。
 *
 * 只在「进入页面的那一刻」判断一次（用 ref 记住首次结果）：
 *   - 如果进来时是匿名 → 立刻跳登录页；
 *   - 如果进来时已登录，之后发生的登录失效交给 api/client.ts 的 401 拦截器处理。
 * 为什么不做成「响应式」的：用户点「退出登录」会先把 store 置为匿名，
 * 这时如果守卫还在盯着 status，它会在跳首页之前抢先跳到登录页 —— 体验很怪。
 * 而真正「用着用着过期」的场景，下一次请求就会 401，拦截器同样会把人送到登录页。
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { loginPath } from '../router/paths'
import { useAuthStore } from '../stores/authStore'

export interface RequireAuthProps {
  children: ReactNode
}

export default function RequireAuth({ children }: RequireAuthProps) {
  const status = useAuthStore((state) => state.status)
  const location = useLocation()
  /** 进入本页时是否已经登录（只取首次渲染的值，之后的状态变化不在这里管） */
  const [allowedOnEntry] = useState(() => status === 'authenticated')

  if (status === 'anonymous' && !allowedOnEntry) {
    return <Navigate to={loginPath(`${location.pathname}${location.search}`)} replace />
  }

  return <>{children}</>
}
