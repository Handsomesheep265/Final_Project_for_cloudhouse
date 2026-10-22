import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BottomNavBar from '../components/BottomNavBar'
import PageHeader from '../components/PageHeader'
import { EyeIcon, EyeOffIcon, LockIcon, SparklesIcon } from '../components/Icons'
import { ApiError } from '../api/client'
import { authApi } from '../api/auth'
import { selectTotalQuantity, useCartStore } from '../stores/cartStore'
import { useAuthStore } from '../stores/authStore'
import { ROUTES } from '../router/paths'
import styles from './AuthPage.module.css'

const PASSWORD_MIN = 6
const PASSWORD_MAX = 64

/**
 * 设置新密码（/reset-password?token=…）
 * ----------------------------------------------------------------------------
 * 用户从邮件（开发环境是页面上直接给的链接）点进来，URL 里带着一次性令牌。
 * 提交后后端会：
 *   1. 校验令牌（未过期、未使用）；
 *   2. 更新密码哈希；
 *   3. 让该用户此前签发的所有 token 失效（其它设备 / 标签页都要重新登录）。
 *
 * 所以这里成功后要顺手把本地登录态也清掉：即便当前标签页是登录状态，
 * 它的 token 也已经失效了，继续留着只会让下一次请求撞 401。
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = (searchParams.get('token') ?? '').trim()
  const cartCount = useCartStore(selectTotalQuantity)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (submitting) return

      const nextErrors: { password?: string; confirm?: string } = {}
      if (!password) nextErrors.password = '请输入新密码'
      else if (password.length < PASSWORD_MIN) nextErrors.password = `密码至少 ${PASSWORD_MIN} 位`
      else if (password.length > PASSWORD_MAX) nextErrors.password = `密码不能超过 ${PASSWORD_MAX} 位`
      if (!confirm) nextErrors.confirm = '请再输入一次新密码'
      else if (confirm !== password) nextErrors.confirm = '两次输入的密码不一致'

      setErrors(nextErrors)
      setFormError(null)
      if (Object.keys(nextErrors).length > 0) return

      setSubmitting(true)
      try {
        await authApi.resetPassword({ token, password })
        // 改密码后旧 token 全部失效，本地也应该回到未登录
        useAuthStore.getState().markExpired('密码已重置，请用新密码登录')
        setDone(true)
      } catch (requestError) {
        const message =
          requestError instanceof ApiError ? requestError.message : '重置失败，请稍后重试'
        if (requestError instanceof ApiError && requestError.code === 40021) {
          setErrors({ password: message })
        } else {
          setFormError(message)
        }
        setSubmitting(false)
      }
    },
    [password, confirm, submitting, token],
  )

  /* 链接里没有令牌：多半是手动拼的地址，直接引导去重新申请 */
  if (token.length === 0) {
    return (
      <div className={styles.page}>
        <PageHeader title="设置新密码" titleAs="h2" to={ROUTES.login} backLabel="返回登录" />
        <main className={styles.main}>
          <section className={styles.card}>
            <h1 className={styles.title}>链接不完整</h1>
            <p className={styles.subtitle}>
              这个地址里没有重置令牌，请重新申请一封找回密码邮件。
            </p>
            <Link className={styles.submit} to={ROUTES.forgotPassword}>
              重新申请重置链接
            </Link>
          </section>
        </main>
        <BottomNavBar cartCount={cartCount} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader title="设置新密码" titleAs="h2" to={ROUTES.login} backLabel="返回登录" />

      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <SparklesIcon size={20} />
            </span>
            <div className={styles.brandText}>
              <h1 className={styles.title}>{done ? '密码已重置' : '设置新密码'}</h1>
              <p className={styles.subtitle}>
                {done
                  ? '其它设备上的登录也会一并失效，请用新密码重新登录。'
                  : '设置一个 6–64 位的新密码，提交后所有旧登录都会失效。'}
              </p>
            </div>
          </div>

          {done ? (
            <Link className={styles.submit} to={ROUTES.login}>
              用新密码登录
            </Link>
          ) : (
            <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
              <label className={styles.field} htmlFor="reset-password">
                <span className={styles.label}>新密码</span>
                <span className={styles.inputWrap}>
                  <LockIcon size={16} className={styles.inputIcon} />
                  <input
                    id="reset-password"
                    className={
                      errors.password
                        ? `${styles.input} ${styles.inputWithAction} ${styles.inputError}`
                        : `${styles.input} ${styles.inputWithAction}`
                    }
                    value={password}
                    type={showPassword ? 'text' : 'password'}
                    maxLength={PASSWORD_MAX}
                    autoComplete="new-password"
                    placeholder={`${PASSWORD_MIN}–${PASSWORD_MAX} 位`}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'reset-password-error' : undefined}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setErrors((current) => ({ ...current, password: undefined }))
                      setFormError(null)
                    }}
                  />
                  <button
                    type="button"
                    className={styles.eye}
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </span>
                {errors.password ? (
                  <span className={styles.fieldError} id="reset-password-error">
                    {errors.password}
                  </span>
                ) : (
                  <span className={styles.fieldHint}>至少 {PASSWORD_MIN} 位，建议字母加数字</span>
                )}
              </label>

              <label className={styles.field} htmlFor="reset-confirm">
                <span className={styles.label}>确认新密码</span>
                <span className={styles.inputWrap}>
                  <LockIcon size={16} className={styles.inputIcon} />
                  <input
                    id="reset-confirm"
                    className={
                      errors.confirm
                        ? `${styles.input} ${styles.inputError}`
                        : styles.input
                    }
                    value={confirm}
                    type={showPassword ? 'text' : 'password'}
                    maxLength={PASSWORD_MAX}
                    autoComplete="new-password"
                    placeholder="再输入一次新密码"
                    aria-invalid={Boolean(errors.confirm)}
                    aria-describedby={errors.confirm ? 'reset-confirm-error' : undefined}
                    onChange={(event) => {
                      setConfirm(event.target.value)
                      setErrors((current) => ({ ...current, confirm: undefined }))
                      setFormError(null)
                    }}
                  />
                </span>
                {errors.confirm && (
                  <span className={styles.fieldError} id="reset-confirm-error">
                    {errors.confirm}
                  </span>
                )}
              </label>

              {formError && (
                <p className={styles.formError} role="alert">
                  {formError}
                </p>
              )}

              <button type="submit" className={styles.submit} disabled={submitting}>
                {submitting ? '提交中…' : '保存新密码'}
              </button>
            </form>
          )}

          <p className={styles.switch}>
            <Link className={styles.switchBtn} to={ROUTES.forgotPassword}>
              重新申请重置链接
            </Link>
          </p>

          <p className={styles.footnote}>
            重置链接只能使用一次；如果已经过期，请重新申请。
          </p>
        </section>
      </main>

      <BottomNavBar cartCount={cartCount} />
    </div>
  )
}
