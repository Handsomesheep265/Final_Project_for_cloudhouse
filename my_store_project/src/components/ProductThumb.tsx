import { useState } from 'react'
import { resolveImageUrl } from '../utils/assetUrl'
import styles from './ProductThumb.module.css'

/** 占位图配色，按商品 id 轮换，保证同一商品每次渲染配色一致 */
const FALLBACK_TONES = [
  'toneSunrise',
  'toneSage',
  'toneBlush',
  'toneMist',
  'toneSand',
  'toneLilac',
] as const

export interface ProductThumbProps {
  /** 图片地址：后端返回的 URL，或 src/assets 下的相对路径 */
  src?: string | null
  /** 图片替代文本（同时用作占位图首字） */
  alt: string
  /** 用于挑选占位配色的种子，一般传商品 id */
  seed?: number
  className?: string
  /** 首屏可见的图片用 eager 加载 */
  priority?: boolean
  /** 小尺寸展示（如购物车行），占位图会收紧字号并隐藏提示文字 */
  compact?: boolean
}

/**
 * 商品图片容器（4:5 竖图）
 * ----------------------------------------------------------------------------
 * - 图片放在 src/assets/products 下，缺少文件时自动降级为占位图，
 *   不会报错、不会影响页面布局；
 * - 图片加载失败（文件损坏等）时同样回退到占位图。
 */
export default function ProductThumb({
  src,
  alt,
  seed = 0,
  className = '',
  priority = false,
  compact = false,
}: ProductThumbProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const url = resolveImageUrl(src)
  const showFallback = !url || failedSrc === url
  const classes = [styles.thumb, compact ? styles.compact : '', className]
    .filter(Boolean)
    .join(' ')

  if (showFallback) {
    const tone = FALLBACK_TONES[Math.abs(seed) % FALLBACK_TONES.length]
    return (
      <div className={`${classes} ${styles.fallback} ${styles[tone]}`} role="img" aria-label={alt}>
        <span className={styles.glyph} aria-hidden="true">
          {alt.slice(0, 1) || '手'}
        </span>
        <span className={styles.hint} aria-hidden="true">
          图片待补充
        </span>
      </div>
    )
  }

  return (
    <div className={classes}>
      <img
        className={styles.image}
        src={url}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailedSrc(url)}
      />
    </div>
  )
}
