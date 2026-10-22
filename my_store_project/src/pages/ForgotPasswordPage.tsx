import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import BottomNavBar from '../components/BottomNavBar'
import PageHeader from '../components/PageHeader'
import { MailIcon, SparklesIcon } from '../components/Icons'
import { ApiError } from '../api/client'
import { authApi } from '../api/auth'
import { selectTotalQuantity, useCartStore } from '../stores/cartStore'
import { ROUTES } from '../router/paths'
import type { ForgotPasswordResultVO } from '../types/auth'
import styles from './AuthPage.module.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX = 100

/**
 * 开发环境的重置链接是后端按 APP_WEB_ORIGIN 拼的（默认 http://127.0.0.1:5173）。
 * 如果前端跑在别的端口（比如 build 产物用 4174 预览），直接点会打不开，
 * 所以这里把 origin 换成当前页面所在的 origin —— 只有开发环境的「展示用链接」会走这里，
 * 生产环境的重置链接是发到邮箱里的原文，不受影响。
 */
function toLocalResetUrl(devUrl: string): string {
  try {
    const url = new URL(devUrl)
    return `${window.location.origin}${url.pathname}${url.search}`
  } catch {
    return devUrl
  }
}

/**
 * 找回密码（/forgot-password）
 * ----------------------------------------------------------------------------
 * 流程：
 *   1. 填注册邮箱 → POST /api/auth/forgot-password；
 *   2. 后端生成一次性令牌（30 分钟有效），把重置链接发邮件；
 *   3. 本地没接 SMTP，所以非生产环境后端会把链接直接回给前端，
 *      这里把它显示成可点击的链接，方便验收；生产环境 devResetUrl 为 null，
 *      用户只会看到「如果该邮箱已注册，重置链接已发送」。
 *
 * ⚠️ 无论邮箱是否存在，提示都一样 —— 后端就是这么设计的（防邮箱枚举），前端不要自作聪明。
 */
export default function ForgotPasswordPage() {
  const cartCount = useCartStore(selectTotalQuantity)

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ForgotPasswordResultVO | null>(null)
  // 开发环境展示用的重置链接（origin 换成当前页面所在地址）
  const devResetLink = result?.devResetUrl ? toLocalResetUrl(result.devResetUrl) : null

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (submitting) return

      const value = email.trim()
      if (!value) {
        setError('请输入注册时用的邮箱')
        return
      }
      if (!EMAIL_PATTERN.test(value) || value.length > EMAIL_MAX) {
        setError('邮箱格式不正确，例如 name@example.com')
        return
      }

      setError(null)
      setFormError(null)
      setSubmitting(true)
      try {
        const response = await authApi.forgotPassword({ email: value })
        setResult(response)
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.code === 40020) {
          setError(requestError.message)
        } else {
          setFormError(
            requestError instanceof ApiError ? requestError.message : '发送失败，请稍后重试',
          )
        }
        setSubmitting(false)
      }
    },
    [email, submitting],
  )

  return (
    <div className={styles.page}>
      <PageHeader title="找回密码" titleAs="h2" to={ROUTES.login} backLabel="返回登录" />

      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <SparklesIcon size={20} />
            </span>
            <div className={styles.brandText}>
              <h1 className={styles.title}>
                {result ? '重置链接已发出' : '忘记密码了？'}
              </h1>
              <p className={styles.subtitle}>
                {result
                  ? '请通过邮件里的链接设置新密码，链接 30 分钟内有效。'
                  : '输入注册时用的邮箱，我们会发送一封带重置链接的邮件。'}
              </p>
            </div>
          </div>

          {result ? (
            <>
              <p className={styles.notice} role="status">
                如果 <strong>{email.trim()}</strong> 已注册，重置链接已发送，请查收邮件。
              </p>

              {devResetLink !== null && (
                <div className={styles.linkBox}>
                  <span className={styles.linkBoxTitle}>开发环境 · 未配置 SMTP，邮件内容直接给你：</span>
                  <a href={devResetLink}>{devResetLink}</a>
                  <span className={styles.linkBoxHint}>
                    链接 {result.expiresInMinutes} 分钟内有效，且只能使用一次。
                  </span>
                </div>
              )}

              <div className={styles.resultActions}>
                <button
                  type="button"
                  className={styles.ghostAction}
                  onClick={() => {
                    setResult(null)
                    setSubmitting(false)
                  }}
                >
                  换个邮箱
                </button>
                <Link className={styles.submit} to={ROUTES.login}>
                  去登录
                </Link>
              </div>
            </>
          ) : (
            <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
              <label className={styles.field} htmlFor="forgot-email">
                <span className={styles.label}>邮箱</span>
                <span className={styles.inputWrap}>
                  <MailIcon size={16} className={styles.inputIcon} />
                  <input
                    id="forgot-email"
                    className={error ? `${styles.input} ${styles.inputError}` : styles.input}
                    value={email}
                    type="email"
                    inputMode="email"
                    maxLength={EMAIL_MAX}
                    autoComplete="email"
                    placeholder="name@example.com"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'forgot-email-error' : undefined}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setError(null)
                      setFormError(null)
                    }}
                  />
                </span>
                {error && (
                  <span className={styles.fieldError} id="forgot-email-error">
                    {error}
                  </span>
                )}
              </label>

              {formError && (
                <p className={styles.formError} role="alert">
                  {formError}
                </p>
              )}

              <button type="submit" className={styles.submit} disabled={submitting}>
                {submitting ? '发送中…' : '发送重置链接'}
              </button>
            </form>
          )}

          <p className={styles.switch}>
            想起密码了？
            <Link className={styles.switchBtn} to={ROUTES.login}>
              返回登录
            </Link>
          </p>

          <p className={styles.footnote}>
            为保护账号安全，无论邮箱是否注册过，提示都相同。
            {result?.devResetUrl ? ' 生产环境会把链接发到邮箱，不会显示在页面上。' : ''}
          </p>
        </section>
      </main>

      <BottomNavBar cartCount={cartCount} />
    </div>
  )
}
