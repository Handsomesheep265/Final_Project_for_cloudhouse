
# 线上手帐集市 AI 开发指令

## 项目概述
这是一个线上手帐集市应用，旨在为手帐爱好者提供一个展示、交流和交易的平台。
- 前端：基于 React + Vite + npm 构建的单页应用。
- 后端：基于 Java + Spring Boot + MySQL 构建的 RESTful API 服务。
- 核心功能：包含首页入口、购物车系统、个人主页管理、商品展示与交易流程。

## 开发规范

### 前端 (React + Vite)
- 语言：必须使用 TypeScript，确保类型安全。
- 组件模式：全面使用函数式组件 + Hooks (useState, useEffect, useContext 等)。
- 样式方案：推荐使用 CSS Modules 或 Tailwind CSS（根据项目具体配置），保持样式隔离。
- 状态管理：对于购物车等全局状态，需使用 Context API 或 Zustand/Redux（视复杂度而定）。
- 路由管理：使用 React Router 进行页面跳转管理。

### 后端 (Spring Boot)
- 架构模式：遵循标准的 Controller -> Service -> Repository/Mapper 分层架构。
- 接口规范：所有接口返回统一的 JSON 格式（如 { code, message, data }）。
- ORM 框架：使用 MyBatis-Plus 或 Spring Data JPA 操作 MySQL 数据库。
- 数据校验：使用 Jakarta Validation 进行参数校验。

## 代码风格
- 前端命名：组件名使用 PascalCase，函数/变量名使用 camelCase，常量使用 UPPER_SNAKE_CASE。
- 后端命名：类名使用 PascalCase，方法名使用 camelCase，数据库字段使用 snake_case。
- 工具链：前端配置 ESLint + Prettier；后端配置 Checkstyle 或 Spotless。

环境适配 (Windows 专用)
由于开发环境为 Windows，AI 在生成脚本或指令时必须遵守以下规则：
- 终端命令：务必使用适配 Windows 终端的命令。
    - 优先使用跨平台命令或 npm scripts。
    - 若涉及文件操作，避免直接使用 Linux 专属命令（如 rm -rf, ls, grep），应使用 del, dir, findstr 或 Node.js 脚本替代。
    - 路径分隔符建议使用 / (Node.js 兼容) 或 \，避免直接使用  导致转义问题。
- 环境变量：设置环境变量时请提供 Windows PowerShell 或 CMD 的对应写法（例如 set VAR=value 或 $env:VAR="value"）。

## 测试要求
- 单元测试：后端核心业务逻辑（Service层）需编写 JUnit 测试用例。
- 接口测试：使用 Postman 或 Apifox 验证前后端接口连通性。
- 功能验证：
    - 确保“加入购物车”与“个人主页”数据同步正确。
    - 验证 MySQL 数据的增删改查事务一致性。

## 注意事项
- 保持代码简洁：避免过度设计，优先实现核心交易链路。
- 移动端适配：考虑到“集市”属性，前端页面需做好响应式布局，适配手机端访问。
- 安全性：用户密码必须加密存储（如 BCrypt），敏感接口需做鉴权处理。
- 部署预留：虽然目前不涉及部署，但配置文件（application.yml）需预留好生产环境配置占位符。

