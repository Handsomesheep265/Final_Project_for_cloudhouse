/**
 * 订单模块 · 请求 DTO（入参）
 * ----------------------------------------------------------------------------
 * 两条通用约定（同购物车模块）：
 *   1. userId 不进 DTO —— 由鉴权中间件注入，否则客户端能替别人下单；
 *   2. 金额不进 DTO —— 订单总额一律服务端按商品当前价格重算，
 *      信任客户端传来的价格等于把「改价」权限交给用户。
 *
 * 注意：tsconfig 开了 exactOptionalPropertyTypes，可选字段只能「不传」，
 * 不能显式传 undefined；这里的 query 字段写成了 `string | undefined`（非可选），
 * 因为查询参数本来就可能是「没有」，这样读 query 时不用拼对象。
 */

/** POST /api/orders —— 结算下单（把购物车已勾选的行转成订单） */
export interface CreateOrderDTO {
  /** 收货人，1 ~ 50 字符，不能为空白 */
  receiverName: string
  /** 收货电话，11 位手机号（1[3-9] 开头） */
  receiverPhone: string
  /** 收货地址，1 ~ 300 字符，不能为空白 */
  receiverAddress: string
}

/**
 * GET /api/orders —— 我的订单列表的查询参数
 * ----------------------------------------------------------------------------
 * 查询串里拿到的都是字符串，具体数字/状态的解析与校验在 service 里做，
 * 这样非法值能返回统一的业务错误码，而不是被 controller 静默丢弃。
 */
export interface OrderListQueryDTO {
  /** 页码，从 1 开始，默认 1 */
  page: string | undefined
  /** 每页条数，默认 10，上限 50 */
  pageSize: string | undefined
  /** 订单状态筛选，取值见 OrderStatus；不传表示全部 */
  status: string | undefined
}
