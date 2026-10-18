import { useCallback, useEffect, useState } from 'react'
import type { Theme } from '../types'

/**
 * 日间 / 夜间模式切换
 * ----------------------------------------------------------------------------
 * 主题写在 <html data-theme="light | dark"> 上，颜色变量定义在 src/index.css。
 * 优先级：本地缓存 > 系统偏好（prefers-color-scheme）。
 */

const STORAGE_KEY = 'journal-bazaar:theme'

export interface UseThemeResult {
  theme: Theme
  isDark: boolean
  toggleTheme: () => void
}

function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // 隐私模式下 localStorage 可能不可用，忽略即可
  }
  return null
}

function getPreferredTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = readStoredTheme()
  if (stored) return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useState<Theme>(getPreferredTheme)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.setProperty('color-scheme', theme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // 忽略写入失败
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, isDark: theme === 'dark', toggleTheme }
}
