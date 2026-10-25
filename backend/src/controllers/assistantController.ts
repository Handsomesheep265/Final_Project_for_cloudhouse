/**
 * AI 手帐助手控制器（Controller）
 * ----------------------------------------------------------------------------
 * 只做三件事（与其它模块同构）：
 *   1. 从请求里取参数（body / query / 路径 / 鉴权中间件注入的 userId）；
 *   2. 调 assistantService；
 *   3. 用统一响应体 { code, message, data } 返回。
 *
 * 两类接口的鉴权不一样：
 *   POST /chat                     —— 公开：未登录也能问，只是不落库；
 *                                     登录了就自动把这一轮问答写进会话。
 *   /conversations/**              —— 必须登录（路由层 requireAuth），
 *                                     否则「历史对话」就成了公开数据库。
 */
import type { Request, RequestHandler, Response } from 'express'
import type { AuthenticatedRequest } from '../middlewares/auth'
import {
  ASSISTANT_ERRORS,
  AssistantError,
  assistantService,
  AssistantService,
} from '../services/assistantService'
import type { ApiResponse } from '../types/common'
import type { AssistantChatDTO, CreateConversationDTO } from '../types/assistant.dto'

/** 统一成功响应 */
function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = { code: 0, message: 'ok', data }
  res.status(status).json(body)
}

/** 当前登录用户；会话类接口必须登录（路由层已有 requireAuth，这里再兜一层） */
function requireUserId(req: Request): number {
  const { userId } = req as AuthenticatedRequest
  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    throw new AssistantError(ASSISTANT_ERRORS.unauthorized)
  }
  return userId
}

/** 把 body 当对象读：非对象（字符串 / 数组 / 空 body）一律当空对象，交给 service 报错 */
function readBody(req: Request): Record<string, unknown> {
  const body: unknown = req.body
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    return body as Record<string, unknown>
  }
  return {}
}

/** 查询串取值：数组取第一个，其余当没传 */
function queryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

/** 路径参数里的会话 id：原样字符串交给 service 校验 */
function readConversationIdParam(req: Request): string {
  const raw = req.params.conversationId
  return typeof raw === 'string' ? raw : ''
}

export interface AssistantController {
  /** 聊天：接收自然语言，返回推荐与理由（登录时落库） */
  chat: RequestHandler
  /** 我的历史对话列表 */
  listConversations: RequestHandler
  /** 开启一轮新对话 */
  createConversation: RequestHandler
  /** 查看某个会话的完整对话 */
  getConversation: RequestHandler
  /** 删除某个会话 */
  deleteConversation: RequestHandler
}

/** 工厂函数：注入不同的 AssistantService 便于做 mock 单元测试 */
export function createAssistantController(service: AssistantService): AssistantController {
  return {
    /**
     * POST /api/assistant/chat
     * body: { message, conversationId?, history? }
     * 未登录：userId 为 null，只回答不落库；登录：自动新建/续写会话。
     */
    chat: async (req, res) => {
      const dto: AssistantChatDTO = readBody(req)
      const { userId } = req as AuthenticatedRequest
      sendSuccess(res, await service.chat(dto, userId ?? null))
    },

    /** GET /api/assistant/conversations?page=1&pageSize=10 */
    listConversations: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(
        res,
        await service.listConversations(userId, {
          page: queryString(req.query.page),
          pageSize: queryString(req.query.pageSize),
        }),
      )
    },

    /** POST /api/assistant/conversations —— body: { title? } */
    createConversation: async (req, res) => {
      const userId = requireUserId(req)
      const dto: CreateConversationDTO = readBody(req)
      sendSuccess(res, await service.startConversation(userId, dto), 201)
    },

    /** GET /api/assistant/conversations/:conversationId */
    getConversation: async (req, res) => {
      const userId = requireUserId(req)
      sendSuccess(res, await service.getConversation(userId, readConversationIdParam(req)))
    },

    /** DELETE /api/assistant/conversations/:conversationId */
    deleteConversation: async (req, res) => {
      const userId = requireUserId(req)
      await service.deleteConversation(userId, readConversationIdParam(req))
      sendSuccess(res, null)
    },
  }
}

/** 默认实例：service 用真实仓储层（连接池见 src/config/database.ts） */
export const assistantController: AssistantController = createAssistantController(assistantService)
