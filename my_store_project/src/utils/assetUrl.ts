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

/**
 * 解析图片地址，兼容两种来源：
 *   - 后端返回的完整 URL（http(s)://、//cdn…、/uploads/…、data:）直接使用；
 *   - 本地静态资源键（products/xxx.png）走 assets 映射，找不到时返回 null 交给占位图。
 *
 * 这样后端还没上对象存储、种子数据里只写了相对路径时，前端也能正常显示图片。
 */
export function resolveImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('/') || value.startsWith('data:')) {
    return value
  }
  return getAsset(value)
}
