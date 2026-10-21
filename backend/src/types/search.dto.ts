/**
 * 搜索模块 · 请求 DTO（入参）
 * ----------------------------------------------------------------------------
 * 搜索是公开接口，不需要登录，所以没有 userId 字段。
 * 查询串里拿到的都是字符串，解析与校验（关键词长度、分页边界、type 取值）在 service。
 */

/** GET /api/search?keyword=手帐&type=all&page=1&pageSize=10 */
export interface SearchQueryDTO {
  /** 关键词，去空白后至少 2 个字符（ngram_token_size=2，单字搜不到） */
  keyword: string | undefined
  /** 搜索范围：all（默认）| product | shop */
  type: string | undefined
  /** 页码，从 1 开始，默认 1 */
  page: string | undefined
  /** 每页条数，默认 10，上限 20 */
  pageSize: string | undefined
}
