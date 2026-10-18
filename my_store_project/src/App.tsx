import Homepage from './pages/Homepage'

/**
 * 应用入口
 * ----------------------------------------------------------------------------
 * 目前只实现了首页，因此直接渲染 <Homepage />；
 * 后续接入 React Router 时，把这里替换成 <Routes> / <Route> 即可，
 * 页面组件本身不需要改动。
 */
function App() {
  return <Homepage />
}

export default App
