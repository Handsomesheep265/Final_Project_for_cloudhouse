import { Navigate, createBrowserRouter } from 'react-router-dom'
import Homepage from '../pages/Homepage'
import CartPage from '../pages/CartPage'
import CheckoutPage from '../pages/CheckoutPage'
import OrdersPage from '../pages/OrdersPage'
import OrderDetailPage from '../pages/OrderDetailPage'
import ProductDetailPage from '../pages/ProductDetailPage'
import ProfilePage from '../pages/ProfilePage'
import { ROUTES } from './paths'

/**
 * 应用路由表
 * ----------------------------------------------------------------------------
 * - `/`              首页
 * - `/cart`          购物车
 * - `/checkout`      确认订单（收货信息 + 商品清单 + 提交）
 * - `/orders`        我的订单（分页 + 状态筛选）
 * - `/orders/:orderNo` 订单详情（链接统一用 paths.ts 的 orderDetailPath 生成）
 * - `/profile`       个人主页（资料 + 收藏 + 我发布的商品）
 * - `/products/:productId` 商品详情（链接统一用 paths.ts 的 productPath 生成）
 * - `*`              尚未实现的地址统一回首页，避免直接输入 /profile 之类路径时出现空白页
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
    path: ROUTES.checkout,
    element: <CheckoutPage />,
  },
  {
    path: ROUTES.orders,
    element: <OrdersPage />,
  },
  {
    path: `${ROUTES.orders}/:orderNo`,
    element: <OrderDetailPage />,
  },
  {
    path: ROUTES.profile,
    element: <ProfilePage />,
  },
  {
    path: `${ROUTES.products}/:productId`,
    element: <ProductDetailPage />,
  },
  {
    path: '*',
    element: <Navigate to={ROUTES.home} replace />,
  },
])
