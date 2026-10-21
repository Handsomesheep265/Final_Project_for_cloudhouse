/**
 * 搜索接口
 * ----------------------------------------------------------------------------
 * GET /api/search?keyword=手帐&type=all&page=1&pageSize=10
 *
 * 关键词至少 2 个字符（后端 ngram 索引的最小粒度），不足会返回 40013，
 * 前端在发请求之前就先拦一道，只在「真的调接口」时才可能看到这个错误。
 */
import { request } from './client'
import type { SearchResultVO, SearchType } from '../types/search'

const SEARCH_PATH = '/api/search'

export interface SearchParams {
  keyword: string
  /** 默认 all（商品 + 店铺一次拿全，前端用 tab 切换） */
  type?: SearchType
  page?: number
  pageSize?: number
}

export const searchApi = {
  search: (params: SearchParams) => {
    const search = new URLSearchParams({ keyword: params.keyword })
    if (params.type !== undefined) search.set('type', params.type)
    if (params.page !== undefined) search.set('page', String(params.page))
    if (params.pageSize !== undefined) search.set('pageSize', String(params.pageSize))

    return request<SearchResultVO>(`${SEARCH_PATH}?${search.toString()}`)
  },
}
