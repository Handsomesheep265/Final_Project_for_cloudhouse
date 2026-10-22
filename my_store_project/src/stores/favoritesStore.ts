/**
 * 收藏状态（接口驱动，首页与个人主页共用）
 * ----------------------------------------------------------------------------
 * 为什么单独抽一个 store：
 *   首页的爱心按钮和个人主页的「我的收藏」是同一份数据。
 *   如果各自维护 set / list，会出现「首页点了爱心，个人主页还是空的」这种不一致。
 *
 * 数据形态：
 *   - ids  ：商品 id 集合，首页只关心「这个商品有没有被收藏」，用它做 O(1) 判断；
 *   - items：最近一次加载的收藏条目（个人主页直接渲染），上限 MAX_LOADED_FAVORITES 条。
 *
 * 交互策略：
 *   点击时先乐观更新（爱心立刻变），接口失败再回滚并重新拉一次，避免停留在错误状态。
 *
 * 与登录态的关系：
 *   - 未登录时收藏接口返回 401，refresh 直接按「没有收藏」处理，不发请求；
 *   - toggle 在未登录时抛 40102 —— 页面的爱心按钮通常已被 useLoginGate 拦下，
 *     这里是第二道保险；退登时页面会调用 reset() 清掉上一个账号的收藏。
 */
import { create } from 'zustand'
import { ApiError } from '../api/client'
import { profileApi } from '../api/profile'
import { isAuthenticatedNow, loginRequiredError } from './authStore'
import type { FavoriteItemVO } from '../types/profile'

/** 一次性最多加载多少条收藏（个人主页只展示最近这些；后端上限 50） */
export const MAX_LOADED_FAVORITES = 50

export type FavoritesStatus = 'idle' | 'loading' | 'ready' | 'error'

interface FavoritesState {
  /** 已加载的收藏（按收藏时间倒序） */
  items: FavoriteItemVO[]
  /** 商品 id 集合，首页爱心按钮用 */
  ids: ReadonlySet<number>
  /** 收藏总数（可能大于已加载条数） */
  total: number
  status: FavoritesStatus
  error: string | null
  /** 正在提交的商品 id，用于禁用对应按钮 */
  pending: ReadonlySet<number>
}

interface FavoritesActions {
  /** 拉取收藏（进入首页 / 个人主页时调用）；未登录时清空本地，不发请求 */
  refresh: () => Promise<void>
  /** 收藏 / 取消收藏，返回操作后的状态；失败会回滚并抛出 */
  toggle: (productId: number) => Promise<boolean>
  /** 清空本地状态（退出登录时调用） */
  reset: () => void
}

export interface FavoritesStore extends FavoritesState, FavoritesActions {}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  return error instanceof Error ? error.message : '收藏操作失败，请稍后重试'
}

export const useFavoritesStore = create<FavoritesStore>()((set, get) => {
  const applyList = (list: FavoriteItemVO[], total: number): void => {
    set({
      items: list,
      ids: new Set(list.map((item) => item.productId)),
      total,
      status: 'ready',
      error: null,
    })
  }

  return {
    items: [],
    ids: new Set<number>(),
    total: 0,
    status: 'idle',
    error: null,
    pending: new Set<number>(),

    refresh: async () => {
      if (!isAuthenticatedNow()) {
        // 未登录：收藏接口是 401 的，本地按「没有收藏」处理，爱心保持空心
        set({ items: [], ids: new Set<number>(), total: 0, status: 'idle', error: null })
        return
      }

      set({ status: 'loading' })
      try {
        const result = await profileApi.listFavorites({ page: 1, pageSize: MAX_LOADED_FAVORITES })
        applyList(result.list, result.total)
      } catch (error) {
        set({ status: 'error', error: toMessage(error) })
      }
    },

    reset: () => {
      applyList([], 0)
      set({ status: 'idle', error: null, pending: new Set<number>() })
    },

    toggle: async (productId) => {
      if (!isAuthenticatedNow()) {
        throw loginRequiredError('请先登录后再收藏商品')
      }

      const { ids, items, pending } = get()
      // 同一个商品正在提交时不重复点击
      if (pending.has(productId)) return ids.has(productId)

      const wasFavorited = ids.has(productId)
      const nextIds = new Set(ids)
      const nextPending = new Set(pending)
      nextPending.add(productId)

      // 乐观更新：爱心 / 列表立刻响应，接口失败再以服务端为准回滚
      if (wasFavorited) nextIds.delete(productId)
      else nextIds.add(productId)

      set({
        ids: nextIds,
        items: wasFavorited ? items.filter((item) => item.productId !== productId) : items,
        pending: nextPending,
        error: null,
      })

      try {
        const result = wasFavorited
          ? await profileApi.removeFavorite(productId)
          : await profileApi.addFavorite(productId)

        // 成功后以服务端列表为准：避免「乐观更新」和「页面初次加载的 refresh」
        // 交错时把 ids 覆盖成旧值（爱心明明点了却不亮）。
        await get().refresh()
        return result.favorited
      } catch (error) {
        await get().refresh()
        set({ error: toMessage(error) })
        throw error
      } finally {
        const rest = new Set(get().pending)
        rest.delete(productId)
        set({ pending: rest })
      }
    },
  }
})

/* ------------------------------ 派生数据 ------------------------------ */

/** 首页用：判断某个商品是否已收藏 */
export const selectIsFavorite =
  (productId: number) =>
  (state: FavoritesStore): boolean =>
    state.ids.has(productId)

export const selectFavoriteIds = (state: FavoritesStore): ReadonlySet<number> => state.ids
export const selectFavoriteItems = (state: FavoritesStore): FavoriteItemVO[] => state.items
export const selectFavoritesTotal = (state: FavoritesStore): number => state.total
export const selectFavoritesStatus = (state: FavoritesStore): FavoritesStatus => state.status
export const selectFavoritesError = (state: FavoritesStore): string | null => state.error
