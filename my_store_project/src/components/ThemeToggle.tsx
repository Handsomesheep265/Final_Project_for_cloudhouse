import type { Theme } from '../types'
import { MoonIcon, SunIcon } from './Icons'
import styles from './ThemeToggle.module.css'

export interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
}

/** 日间 / 夜间模式切换按钮（README：页面支持风格切换） */
export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark'
  const label = isDark ? '切换到日间模式' : '切换到夜间模式'

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={onToggle}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
    </button>
  )
}
