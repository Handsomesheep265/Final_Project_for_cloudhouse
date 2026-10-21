import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { API_BASE } from './api/client'

const container = document.getElementById('root')

if (!container) {
  throw new Error('未找到 #root 挂载节点')
}

/**
 * 启动时打一行版本信息。
 * 排障时有用：能立刻确认「浏览器里跑的是哪份产物、连的是哪个后端」——
 * 例如页面行为像旧版本时，看这行就知道是不是加载了旧的 build / 缓存。
 */
console.info(
  `[手帐集市] 前端已加载 · 模式=${import.meta.env.MODE} · 接口地址=${API_BASE} · 分类筛选=接口驱动`,
)

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
