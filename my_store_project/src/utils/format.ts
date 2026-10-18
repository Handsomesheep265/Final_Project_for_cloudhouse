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
