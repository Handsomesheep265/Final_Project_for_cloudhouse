/**
 * 页面通用页头
 * ----------------------------------------------------------------------------
 * 确认订单 / 订单列表 / 订单详情三个页面共用同一套「返回 + 标题 + 右侧附加」结构，
 * 抽出来避免每个页面的 CSS 里各复制一份 header。
 *
 * 与购物车页的页头保持一致：吸顶、磨砂、圆形返回按钮。
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from './Icons'
import styles from './PageHeader.module.css'

export interface PageHeaderProps {
  /** 页面标题 */
  title: string
  /** 返回按钮的目标地址 */
  to: string
  /** 返回按钮的无障碍文案 */
  backLabel?: string
  /** 右侧附加内容（件数、次要入口等） */
  right?: ReactNode
}

export default function PageHeader({ title, to, backLabel = '返回', right }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.back} to={to} aria-label={backLabel}>
          <ArrowLeftIcon size={18} />
        </Link>
        <h1 className={styles.title}>{title}</h1>
        {/* 没有右侧内容时留一个空占位，保证标题始终左对齐 */}
        <div className={styles.right}>{right}</div>
      </div>
    </header>
  )
}
