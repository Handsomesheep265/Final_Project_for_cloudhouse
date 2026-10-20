/**
 * 路由路径常量
 * ----------------------------------------------------------------------------
 * 单独放在这里而不是写进 router/index.tsx，是为了避免循环依赖：
 * router/index.tsx -> pages/CartPage.tsx -> components/BottomNavBar.tsx
 * 若 BottomNavBar 直接从 router/index.tsx 取常量，就会在这个环里提前访问未初始化的值。
 */
export const ROUTES = {
  home: '/',
  cart: '/cart',
  /** 确认订单（从购物车「去结算」进入） */
  checkout: '/checkout',
  /** 我的订单（列表） */
  orders: '/orders',
  /** 个人主页 */
  profile: '/profile',
} as const

/** 已实现页面的路径类型 */
export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]

/**
 * 订单详情链接。
 * 订单号含数字，但仍统一 encodeURIComponent，避免以后改成带字母/符号的格式时出问题。
 */
export function orderDetailPath(orderNo: string): string {
  return `${ROUTES.orders}/${encodeURIComponent(orderNo)}`
}
