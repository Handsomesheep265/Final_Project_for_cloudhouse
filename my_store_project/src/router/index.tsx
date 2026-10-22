import { Navigate, createBrowserRouter } from 'react-router-dom'
import RootLayout from '../components/RootLayout'
import RequireAuth from '../components/RequireAuth'
import Homepage from '../pages/Homepage'
import AuthPage from '../pages/AuthPage'
import CartPage from '../pages/CartPage'
import CheckoutPage from '../pages/CheckoutPage'
import OrdersPage from '../pages/OrdersPage'
import OrderDetailPage from '../pages/OrderDetailPage'
import ProductDetailPage from '../pages/ProductDetailPage'
import ProfilePage from '../pages/ProfilePage'
import SearchPage from '../pages/SearchPage'
import ForgotPasswordPage from '../pages/ForgotPasswordPage'
import ResetPasswordPage from '../pages/ResetPasswordPage'
import { ROUTES } from './paths'

/**
 * 应用路由表
 * ----------------------------------------------------------------------------
 * 所有页面挂在 RootLayout 下：它只负责「登录态启动 + 401 跳登录」，不渲染额外节点。
 *
 * 公开页面（未登录也能看）：
 * - `/`                    首页（商品列表 + 分类筛选）
 * - `/products/:productId` 商品详情
 * - `/search?keyword=手帐`  搜索结果
 * - `/login`               登录（?next= 指定登录后回到哪个页面）
 * - `/register`            注册（与登录同一套 UI，靠路径区分模式）
 * - `/forgot-password`     找回密码（填邮箱，开发环境直接给出重置链接）
 * - `/reset-password?token=…` 用邮件里的一次性令牌设置新密码
 *
 * 需要登录（包一层 RequireAuth，未登录时跳登录页并记住来源）：
 * - `/cart`            购物车
 * - `/checkout`        确认订单
 * - `/orders`          我的订单
 * - `/orders/:orderNo` 订单详情（链接统一用 paths.ts 的 orderDetailPath 生成）
 * - `/profile`         个人主页（资料 + 收藏 + 我发布的商品）
 *
 * `*` 统一回首页，避免直接输入不存在的地址时出现空白页。
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: ROUTES.home,
        element: <Homepage />,
      },
      {
        path: ROUTES.cart,
        element: (
          <RequireAuth>
            <CartPage />
          </RequireAuth>
        ),
      },
      {
        path: ROUTES.checkout,
        element: (
          <RequireAuth>
            <CheckoutPage />
          </RequireAuth>
        ),
      },
      {
        path: ROUTES.orders,
        element: (
          <RequireAuth>
            <OrdersPage />
          </RequireAuth>
        ),
      },
      {
        path: `${ROUTES.orders}/:orderNo`,
        element: (
          <RequireAuth>
            <OrderDetailPage />
          </RequireAuth>
        ),
      },
      {
        path: ROUTES.profile,
        element: (
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        ),
      },
      {
        path: ROUTES.login,
        element: <AuthPage />,
      },
      {
        path: ROUTES.register,
        element: <AuthPage />,
      },
      {
        path: ROUTES.forgotPassword,
        element: <ForgotPasswordPage />,
      },
      {
        path: ROUTES.resetPassword,
        element: <ResetPasswordPage />,
      },
      {
        path: `${ROUTES.products}/:productId`,
        element: <ProductDetailPage />,
      },
      {
        path: ROUTES.search,
        element: <SearchPage />,
      },
      {
        path: '*',
        element: <Navigate to={ROUTES.home} replace />,
      },
    ],
  },
])
