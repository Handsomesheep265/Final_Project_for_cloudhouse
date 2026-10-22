/**
 * 全局登录态（Zustand）
 * ----------------------------------------------------------------------------
 * 全应用唯一的「我是谁」来源：
 *   - status  ：authenticated / anonymous，其它地方只读它决定要不要拦操作；
 *   - user    ：当前用户资料（导航栏、个人主页直接用，不必各自请求）；
 *   - token   ：登录凭证，持久化在 localStorage（utils/authSession.ts）里，
 *               所以刷新页面、关掉浏览器再打开都不用重新登录；
 *   - checking：首屏拿本地 token 找后端确认身份的过程（不阻塞页面渲染）。
 *
 * 持久化策略（「一劳永逸」）：
 *   1. 登录/注册成功 → 存 localStorage（token + user + expiresAt）；
 *   2. 应用启动 → 有 token 就调 GET /api/auth/me 确认，成功则把后端新签的
 *      token 写回本地（滑动续期：只要 7 天内来过，就不用重新登录）；
 *   3. token 过期 / 被篡改 / 用户被禁用 → 清本地存储，静默降级为未登录，
 *      于是「未登录也能浏览商品」，只有收藏 / 加购 / 购物车等操作会要求登录。
 *
 * 为什么不用 zustand/persist：storage 里存的是「凭证」，读出来必须先校验结构、
 * 判断过期（utils/authSession.ts 已经做了），persist 的自动 hydrate 反而要再包一层；
 * 这里显式读写，逻辑更直白，也方便以后换成 httpOnly Cookie。
 */
import { create } from 'zustand'
import { ApiError } from '../api/client'
import { authApi } from '../api/auth'
import { clearSession, readSession, saveSession } from '../utils/authSession'
import type { AuthSessionVO, AuthUserVO, LoginPayload, RegisterPayload } from '../types/auth'

export type AuthStatus = 'anonymous' | 'authenticated'

interface AuthState {
  status: AuthStatus
  user: AuthUserVO | null
  token: string | null
  /** 正在向后端确认本地 token（首屏） */
  checking: boolean
  /** 上次 401 的提示语，登录页展示（如「登录状态已过期，请重新登录」） */
  expiredReason: string | null
}

interface AuthActions {
  /** 应用启动时调用一次：用本地 token 换最新会话（并顺延有效期） */
  bootstrap: () => Promise<void>
  login: (payload: LoginPayload) => Promise<AuthUserVO>
  register: (payload: RegisterPayload) => Promise<AuthUserVO>
  /** 退出登录：先让服务端拉黑当前 token，再清本地（服务端失败也照样清） */
  logout: () => Promise<void>
  /** 保存一次会话（登录 / 注册 / 启动校验成功后都走这里） */
  applySession: (session: AuthSessionVO) => void
  /** 401 拦截后调用：清凭证 + 记下原因 */
  markExpired: (reason?: string) => void
  /** 别的标签页登录/续期后：只同步内存状态，不再写一次 storage（避免来回触发） */
  syncFromStorage: () => void
  /** 别的标签页退出登录后：清掉本地状态（storage 已被对方清空） */
  handleExternalLogout: () => void
}

export interface AuthStore extends AuthState, AuthActions {}

/** 初始值直接读本地存储：首屏就知道有没有登录，不用等接口回来才决定渲染什么 */
const stored = readSession()

export const useAuthStore = create<AuthStore>()((set, get) => ({
  status: stored ? 'authenticated' : 'anonymous',
  user: stored?.user ?? null,
  token: stored?.token ?? null,
  checking: false,
  expiredReason: null,

  bootstrap: async () => {
    // 每次页面加载只跑一次（StrictMode 会重复调用 effect）
    if (bootstrapStarted) return
    bootstrapStarted = true

    const token = get().token
    if (!token) {
      set({ status: 'anonymous', user: null, checking: false })
      return
    }

    set({ checking: true })
    try {
      // silentUnauthorized：后端说 token 不行就安静降级，别把用户从首页踢走
      const session = await authApi.me({ silentUnauthorized: true })
      get().applySession(session)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        // 401 有两种可能：
        //   1. token 真的失效了；
        //   2. 另一个标签页刚续期，把这条 token 轮换掉了（后端会拉黑旧 token）。
        // 所以先看 storage 里是不是已经换成新 token：是的话直接采用，别把自己登出。
        const current = readSession()
        if (current && current.token !== token) {
          set({
            status: 'authenticated',
            user: current.user,
            token: current.token,
            checking: false,
          })
          return
        }

        clearSession()
        set({ status: 'anonymous', user: null, token: null, checking: false })
        return
      }
      // 网络不通 / 后端没启动：保留本地登录态（token 可能仍然有效），
      // 让用户继续浏览，写操作时会再收到明确报错
      set({ checking: false })
    }
  },

  login: async (payload) => {
    const session = await authApi.login(payload)
    get().applySession(session)
    return session.user
  },

  register: async (payload) => {
    const session = await authApi.register(payload)
    get().applySession(session)
    return session.user
  },

  logout: async () => {
    // 先请求服务端：把当前 token 的指纹写进黑名单（失败也不影响本地登出）
    try {
      await authApi.logout()
    } catch {
      // token 可能已经过期 / 网络不通：本地照样清，不能让用户卡在登录态
    }

    clearSession()
    set({ status: 'anonymous', user: null, token: null, checking: false, expiredReason: null })
  },

  applySession: (session) => {
    saveSession(session)
    set({
      status: 'authenticated',
      user: session.user,
      token: session.token,
      checking: false,
      expiredReason: null,
    })
  },

  syncFromStorage: () => {
    // 别的标签页登录 / 续期：storage 已经是新值，这里只同步内存，不回写
    const session = readSession()
    if (!session) {
      set({ status: 'anonymous', user: null, token: null, checking: false })
      return
    }
    set({
      status: 'authenticated',
      user: session.user,
      token: session.token,
      checking: false,
      expiredReason: null,
    })
  },

  handleExternalLogout: () => {
    // storage 已被别的标签页清空；本地只需要把内存状态归零
    set({ status: 'anonymous', user: null, token: null, checking: false, expiredReason: null })
  },

  markExpired: (reason) => {
    // 后端对「伪造 / 过期」的提示不一样（请先登录 / 登录状态已过期），
    // 这里统一成对用户更有意义的一句：本次操作确实是因为登录态没了才失败。
    const message = reason && reason !== '请先登录' ? reason : '登录状态已失效，请重新登录'
    clearSession()
    set({
      status: 'anonymous',
      user: null,
      token: null,
      checking: false,
      expiredReason: message,
    })
  },
}))

/** 页面加载后只 bootstrap 一次 */
let bootstrapStarted = false

/* ------------------------------ 派生数据 ------------------------------ */

export const selectAuthStatus = (state: AuthStore): AuthStatus => state.status
export const selectAuthUser = (state: AuthStore): AuthUserVO | null => state.user
export const selectAuthChecking = (state: AuthStore): boolean => state.checking
export const selectExpiredReason = (state: AuthStore): string | null => state.expiredReason

/**
 * 非 React 环境的同步判断（store 的 action、需要提前拦截的点击处理）。
 * 组件里请用 useAuthStore(selectAuthStatus) 以获得重渲染。
 */
export function isAuthenticatedNow(): boolean {
  return useAuthStore.getState().status === 'authenticated'
}

/** 未登录错误的统一构造：给 store 层的操作兜底（正常路径由 useLoginGate 先拦） */
export function loginRequiredError(message: string): ApiError {
  return new ApiError(message, { code: 40102, status: 401 })
}
