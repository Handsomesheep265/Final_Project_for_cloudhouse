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
  /** 登录页（?next= 可指定登录后回到哪个页面） */
  login: '/login',
  /** 注册页（同一套 UI，切换 tab 即可） */
  register: '/register',
  /** 找回密码：填邮箱申请重置链接 */
  forgotPassword: '/forgot-password',
  /** 设置新密码（邮件链接里的 ?token= 会带过来） */
  resetPassword: '/reset-password',
  /** 商品详情（列表前缀，实际地址用 productPath() 拼） */
  products: '/products',
  /** 搜索结果页（?keyword= 由页面自己写进 URL） */
  search: '/search',
  /** AI 手帐助手（全局悬浮入口进入的聊天页） */
  assistant: '/assistant',
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

/**
 * 商品详情链接。
 * 首页卡片、推荐位、购物车行、相关推荐都用它，避免各处手写模板串。
 */
export function productPath(productId: number): string {
  return `${ROUTES.products}/${encodeURIComponent(String(productId))}`
}

/**
 * 登录页链接。
 * next 表示「登录成功后回到哪个页面」，会原样带到 /login?next=…
 */
export function loginPath(next?: string): string {
  return next ? `${ROUTES.login}?next=${encodeURIComponent(next)}` : ROUTES.login
}

/**
 * 校验 ?next= 参数。
 * 只接受站内相对路径：挡掉 `//evil.com`、`https://…` 这类开放重定向，
 * 不然登录页会变成「点一下就跳到外站」的跳板。
 */
export function safeNextPath(raw: string | null, fallback: string = ROUTES.profile): string {
  if (!raw) return fallback
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  return raw
}
