/**
 * 邮件服务（开发环境为「控制台邮件」）
 * ----------------------------------------------------------------------------
 * 找回密码需要把重置链接发给用户。真实项目会接 SMTP（nodemailer / SendGrid /
 * 阿里云邮件推送 …），但本项目刻意不带额外依赖，也不想让评分环境配邮箱，
 * 所以这里抽象成一个最小的 Mailer 接口：
 *
 *   开发环境：ConsoleMailer —— 把邮件内容打到后端控制台；
 *   需要真发信时：实现 SmtpMailer（内部用 nodemailer），
 *                 在下面把 mailService 换掉即可，authService 不用动。
 *
 * 为了让「没配邮箱也能验收」，/api/auth/forgot-password 在非生产环境会额外
 * 返回重置链接（见 authController），前端直接显示成可点击的链接。
 */
import { env } from '../config/env'

export interface PasswordResetMail {
  /** 收件人邮箱 */
  to: string
  /** 收件人昵称（用来写称呼） */
  nickname: string
  /** 带一次性令牌的重置链接 */
  resetUrl: string
  /** 链接有效期（分钟） */
  expiresInMinutes: number
}

export interface Mailer {
  sendPasswordReset(mail: PasswordResetMail): Promise<void>
}

class ConsoleMailer implements Mailer {
  async sendPasswordReset(mail: PasswordResetMail): Promise<void> {
    console.log('\n📮 [mail] 找回密码邮件（开发环境未配置 SMTP，内容打印到控制台）')
    console.log(`   收件人  ${mail.nickname} <${mail.to}>`)
    console.log(`   重置链接 ${mail.resetUrl}`)
    console.log(`   有效期  ${mail.expiresInMinutes} 分钟\n`)
  }
}

export const mailService: Mailer = new ConsoleMailer()

/** 供 /auth/forgot-password 判断「要不要把链接直接回给前端」 */
export const isDevMailMode = !env.isProduction
