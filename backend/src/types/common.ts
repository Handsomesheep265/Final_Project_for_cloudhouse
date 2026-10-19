/**
 * 通用（跨模块）类型
 * ----------------------------------------------------------------------------
 * 响应体格式遵循 docs/AGENTS.md：所有接口统一返回 { code, message, data }。
 *
 * ⚠️ backend/tsconfig.json 开启了 verbatimModuleSyntax + module: commonjs，
 * 在 src/types 下只能写「纯类型」（export interface / export type）；
 * 写 export const / export enum 会直接报 TS1287。
 * 需要运行期常量时请放到 src/constants（非本目录）。
 */

/** 统一响应体 */
export interface ApiResponse<T> {
  /** 业务状态码：0 表示成功，非 0 为业务错误码（HTTP 状态码仍按其语义返回） */
  code: number
  /** 给前端展示或排查问题用的提示信息 */
  message: string
  /** 业务数据；无数据时传 null */
  data: T
}

/** 没有返回数据的接口，如删除、勾选切换 */
export type ApiEmptyResponse = ApiResponse<null>
