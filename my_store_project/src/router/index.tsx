import { Navigate, createBrowserRouter } from 'react-router-dom'
import Homepage from '../pages/Homepage'
import CartPage from '../pages/CartPage'
import { ROUTES } from './paths'

/**
 * 应用路由表
 * ----------------------------------------------------------------------------
 * - `/`      首页
 * - `/cart`  购物车（当前为占位页面，见 src/pages/CartPage.tsx）
 * - `*`      尚未实现的地址统一回首页，避免直接输入 /profile 之类路径时出现空白页
 *
 * 后续接入更多页面（个人主页、商品详情等）时，在这里追加即可；
 * 需要时也可以用 React.lazy + Suspense 做按需加载。
 */
export const router = createBrowserRouter([
  {
    path: ROUTES.home,
    element: <Homepage />,
  },
  {
    path: ROUTES.cart,
    element: <CartPage />,
  },
  {
    path: '*',
    element: <Navigate to={ROUTES.home} replace />,
  },
])
