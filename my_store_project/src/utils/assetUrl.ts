/**
 * src/assets 静态图片统一解析
 * ----------------------------------------------------------------------------
 * 约定：图片按 src/assets/README.md 中的目录与文件名放置，这里会自动收集，
 * 组件中无需逐个 import。
 *
 * 图片缺失时 getAsset() 返回 null，由 <ProductThumb /> / <SellerBadge />
 * 渲染占位样式 —— 因此即使图片还没补齐，页面也能正常构建和预览。
 */

const ASSET_MODULES = import.meta.glob<string>(
  '../assets/**/*.{png,jpg,jpeg,webp,avif,gif,svg}',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
)

const ASSET_PREFIX = '../assets/'

/** 图片相对路径 => 构建后的 URL，例如 'products/sticker.png' */
export const ASSET_URLS: Record<string, string> = Object.keys(ASSET_MODULES).reduce<
  Record<string, string>
>((map, modulePath) => {
  map[modulePath.slice(ASSET_PREFIX.length)] = ASSET_MODULES[modulePath]
  return map
}, {})

/**
 * 取得图片 URL。
 * @param path 相对于 src/assets 的路径，如 'products/retro-kraft-notebook.png'
 * @returns 找不到对应文件时返回 null
 */
export function getAsset(path: string | null | undefined): string | null {
  if (!path) return null
  return ASSET_URLS[path] ?? null
}
