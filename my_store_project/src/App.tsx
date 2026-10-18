import { RouterProvider } from 'react-router-dom'
import { router } from './router'

/**
 * 应用入口
 * ----------------------------------------------------------------------------
 * 路由配置集中在 src/router/index.tsx：目前有首页 `/` 与购物车 `/cart`。
 * 新增页面时只需在路由表里追加，不用改这里。
 */
function App() {
  return <RouterProvider router={router} />
}

export default App
