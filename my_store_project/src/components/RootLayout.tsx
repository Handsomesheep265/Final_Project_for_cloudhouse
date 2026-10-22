import { Outlet } from 'react-router-dom'
import AuthBootstrap from './AuthBootstrap'

/**
 * 路由根布局
 * ----------------------------------------------------------------------------
 * 所有页面都挂在它下面，好处是「全应用只挂一次」的东西有地方放：
 * 登录态启动 & 401 跳转（AuthBootstrap），页面本身仍然是原来的组件，不做改动。
 *
 * 不渲染额外的包裹节点（只有 <Outlet />），页面自己的 flex / min-height 不受影响。
 */
export default function RootLayout() {
  return (
    <>
      <AuthBootstrap />
      <Outlet />
    </>
  )
}
