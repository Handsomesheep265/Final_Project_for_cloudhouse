import { Outlet } from 'react-router-dom'
import AuthBootstrap from './AuthBootstrap'
import AssistantFab from './AssistantFab'

/**
 * 路由根布局
 * ----------------------------------------------------------------------------
 * 所有页面都挂在它下面，好处是「全应用只挂一次」的东西有地方放：
 *   - AuthBootstrap：登录态启动 & 401 跳转（页面本身仍然是原来的组件）；
 *   - AssistantFab：AI 手帐助手的悬浮入口，任何页面都能看到（聊天页自身除外）。
 *
 * 不渲染额外的包裹节点（只有 <Outlet /> + 两个 fixed 定位的附属组件），
 * 页面自己的 flex / min-height 不受影响。
 */
export default function RootLayout() {
  return (
    <>
      <AuthBootstrap />
      <Outlet />
      <AssistantFab />
    </>
  )
}
