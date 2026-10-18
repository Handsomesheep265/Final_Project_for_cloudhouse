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
} as const

/** 已实现页面的路径类型 */
export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]
