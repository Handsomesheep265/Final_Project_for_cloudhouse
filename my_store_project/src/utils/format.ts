/** 价格保留两位小数，如 39.9 => '39.90' */
export function formatPrice(value: number): string {
  const price = Number(value)
  return Number.isFinite(price) ? price.toFixed(2) : '0.00'
}

/** 数量简写，如 12800 => '1.3万' */
export function formatCount(value: number): string {
  const count = Number(value)
  if (!Number.isFinite(count)) return '0'
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`
  return String(count)
}

/**
 * 时间格式化，如 '2026-08-14T12:30:00.000Z' => '2026-08-14 20:30'（本地时区）。
 * 订单接口下发的是 ISO 字符串，直接展示给用户太丑，这里统一转成中文习惯的写法。
 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const pad = (value: number): string => String(value).padStart(2, '0')
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
