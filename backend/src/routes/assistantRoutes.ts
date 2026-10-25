/**
 * AI 手帐助手路由
 * ----------------------------------------------------------------------------
 * 挂载方式（在 src/index.ts 里）：
 *     app.use('/api/assistant', assistantRouter)
 *
 *   POST   /api/assistant/chat                         聊天（登录时落库）
 *   GET    /api/assistant/conversations                我的历史对话（分页）
 *   POST   /api/assistant/conversations                开启一轮新对话
 *   GET    /api/assistant/conversations/:id            查看某个对话的完整消息
 *   DELETE /api/assistant/conversations/:id            删除对话
 *
 * 鉴权策略：
 *   - chat 挂 attachAuth（可选身份）：未登录也能问，只是不落库；
 *   - 会话相关接口挂 requireAuth：历史对话是用户私有数据，必须登录。
 *
 * 为什么聊天用 POST：消息是应用数据、可能超过 URL 上限，且天然不该被缓存。
 *
 * 错误处理：不注册 router 级错误中间件，统一由 src/middlewares/errorHandler.ts 处理
 * （空消息 40030、超长 40031、会话 ID 非法 40032、分页非法 40033、标题非法 40034、
 *   会话不存在 40408）。
 */
import { Router } from 'express'
import type { AssistantController } from '../controllers/assistantController'
import { assistantController } from '../controllers/assistantController'
import { attachAuth, requireAuth } from '../middlewares/auth'

/** 工厂函数：便于用假 controller 起一个测试用 router */
export function createAssistantRouter(
  controller: AssistantController = assistantController,
): Router {
  const router = Router()

  // 先解析（可选）登录身份：chat 需要知道「当前是不是登录用户」来决定要不要落库
  router.use(attachAuth)

  // 聊天：公开
  router.post('/chat', controller.chat)

  // 历史对话：必须登录
  router.get('/conversations', requireAuth, controller.listConversations)
  router.post('/conversations', requireAuth, controller.createConversation)
  router.get('/conversations/:conversationId', requireAuth, controller.getConversation)
  router.delete('/conversations/:conversationId', requireAuth, controller.deleteConversation)

  return router
}

export const assistantRouter: Router = createAssistantRouter()
