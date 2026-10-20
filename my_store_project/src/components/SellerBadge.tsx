import { useState } from 'react'
import { resolveImageUrl } from '../utils/assetUrl'
import styles from './SellerBadge.module.css'

export interface SellerBadgeProps {
  name: string
  /** 头像地址：后端 URL 或 src/assets 相对路径；缺失时用昵称首字代替 */
  avatar?: string | null
  size?: 'sm' | 'md'
}

/** 卖家标识（头像 + 昵称） */
export default function SellerBadge({ name, avatar, size = 'md' }: SellerBadgeProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const url = resolveImageUrl(avatar)
  const showImage = Boolean(url) && failedSrc !== url
  const initial = name.slice(0, 1) || '手'

  return (
    <span className={`${styles.badge} ${styles[size]}`}>
      {showImage ? (
        <img
          className={styles.avatar}
          src={url ?? undefined}
          alt=""
          loading="lazy"
          onError={() => setFailedSrc(url)}
        />
      ) : (
        <span className={`${styles.avatar} ${styles.initial}`} aria-hidden="true">
          {initial}
        </span>
      )}
      <span className={styles.name}>{name}</span>
    </span>
  )
}
