import { useCallback, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import BottomNavBar from '../components/BottomNavBar'
import PageHeader from '../components/PageHeader'
import {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  SparklesIcon,
  UserIcon,
} from '../components/Icons'
import { ApiError } from '../api/client'
import { useCartStore, selectTotalQuantity } from '../stores/cartStore'
import { selectAuthStatus, selectExpiredReason, useAuthStore } from '../stores/authStore'
import { ROUTES, safeNextPath } from '../router/paths'
import styles from './AuthPage.module.css'

/** 与后端 authService 的规则保持一致：只为少一次往返，最终以后端校验为准 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX = 100
const PASSWORD_MIN = 6
const PASSWORD_MAX = 64
const NICKNAME_MAX = 50

/** 演示账号（seed.sql 里的卖家 1，密码已由 npm run db:passwords 重置） */
const DEMO_ACCOUNT = { email: 'seller1@example.com', password: '123456' }

/** 登录 / 注册由路径决定，两个路由共用这一个组件 */
type AuthMode = 'login' | 'register'

interface AuthForm {
  nickname: string
  email: string
  password: string
  confirm: string
}

type AuthField = keyof AuthForm
type FieldErrors = Partial<Record<AuthField, string>>

const EMPTY_FORM: AuthForm = { nickname: '', email: '', password: '', confirm: '' }

/**
 * 后端把「哪个字段不对」也编了码，这里映射回输入框，
 * 让提示直接出现在对应字段下方，而不是笼统地挂在按钮上方。
 */
const FIELD_BY_ERROR_CODE: Record<number, AuthField> = {
  40020: 'email',
  40021: 'password',
  40022: 'nickname',
  40920: 'email',
}

/** 前端校验：返回空对象表示可以提交 */
function validate(mode: AuthMode, form: AuthForm): FieldErrors {
  const errors: FieldErrors = {}
  const email = form.email.trim()

  if (!email) errors.email = '请输入邮箱'
  else if (email.length > EMAIL_MAX) errors.email = `邮箱不能超过 ${EMAIL_MAX} 个字符`
  else if (!EMAIL_PATTERN.test(email)) errors.email = '邮箱格式不正确，例如 name@example.com'

  if (!form.password) errors.password = '请输入密码'
  else if (form.password.length < PASSWORD_MIN) errors.password = `密码至少 ${PASSWORD_MIN} 位`
  else if (form.password.length > PASSWORD_MAX) errors.password = `密码不能超过 ${PASSWORD_MAX} 位`

  if (mode === 'register') {
    if (form.nickname.trim().length > NICKNAME_MAX) {
      errors.nickname = `昵称不能超过 ${NICKNAME_MAX} 个字符`
    }
    if (!form.confirm) errors.confirm = '请再输入一次密码'
    else if (form.confirm !== form.password) errors.confirm = '两次输入的密码不一致'
  }

  return errors
}

function inputClass(hasError: boolean): string {
  return hasError ? `${styles.input} ${styles.inputError}` : styles.input
}

/**
 * 登录 / 注册页（/login、/register）
 * ----------------------------------------------------------------------------
 * 一个页面两种模式，靠 URL 区分（便于直接分享 /login 链接，也方便加「未登录跳转」）：
 *   - 登录：邮箱 + 密码；
 *   - 注册：昵称（选填，不填用邮箱前缀）+ 邮箱 + 密码 + 确认密码。
 *
 * 提交成功后由 authStore 保存会话（token / 用户 / 过期时间，持久化在 localStorage），
 * 然后跳到 ?next= 指定的页面（默认个人主页）。
 *
 * 页面顶部的提示来自两处：
 *   - location.state.intent：用户在首页点收藏/加购被拦下来，登录页告诉他「登录后即可收藏商品」；
 *   - authStore.expiredReason：用到一半 token 过期被 401 拦截，提示「登录状态已过期」。
 */
export default function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const cartCount = useCartStore(selectTotalQuantity)

  const status = useAuthStore(selectAuthStatus)
  const expiredReason = useAuthStore(selectExpiredReason)
  const signIn = useAuthStore((state) => state.login)
  const signUp = useAuthStore((state) => state.register)

  const mode: AuthMode = location.pathname === ROUTES.register ? 'register' : 'login'
  /** 登录成功后去哪儿：只接受站内路径，默认个人主页 */
  const nextPath = safeNextPath(searchParams.get('next'))

  // 被登录闸门拦下时的操作名（收藏商品 / 加入购物车…）
  const intentRaw = (location.state as { intent?: unknown } | null)?.intent
  const intent = typeof intentRaw === 'string' ? intentRaw : null

  // 从重置密码页带过来的提示（如「密码已重置，请用新密码登录」）
  const noticeRaw = (location.state as { notice?: unknown } | null)?.notice
  const stateNotice = typeof noticeRaw === 'string' ? noticeRaw : null

  // 切换登录/注册时把邮箱带过去，省得重新输入（切换会重挂载组件）
  const [form, setForm] = useState<AuthForm>(() => {
    const carried = (location.state as { email?: unknown } | null)?.email
    return { ...EMPTY_FORM, email: typeof carried === 'string' ? carried : '' }
  })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const updateField = useCallback((field: AuthField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    // 开始修改就清掉这个字段的旧错误，避免「已经改对了还红着」
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    setFormError(null)
  }, [])

  /** 切换登录 ↔ 注册：URL 变化 + 带上已输入的邮箱与拦截原因 */
  const switchMode = useCallback(
    (target: AuthMode) => {
      const path = target === 'register' ? ROUTES.register : ROUTES.login
      const query = searchParams.toString()
      navigate(query ? `${path}?${query}` : path, {
        state: { email: form.email, ...(intent === null ? {} : { intent }) },
      })
      setErrors({})
      setFormError(null)
    },
    [navigate, searchParams, form.email, intent],
  )

  /** 演示账号一键填入，省得对着文档手敲 */
  const fillDemo = useCallback(() => {
    setForm((current) => ({ ...current, email: DEMO_ACCOUNT.email, password: DEMO_ACCOUNT.password }))
    setErrors({})
    setFormError(null)
  }, [])

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (submitting) return

      const nextErrors = validate(mode, form)
      setErrors(nextErrors)
      setFormError(null)
      if (Object.keys(nextErrors).length > 0) return

      const email = form.email.trim()
      setSubmitting(true)
      try {
        if (mode === 'register') {
          await signUp({
            email,
            password: form.password,
            // 昵称空着就不传，交给后端用邮箱前缀兜底
            ...(form.nickname.trim() ? { nickname: form.nickname.trim() } : {}),
          })
        } else {
          await signIn({ email, password: form.password })
        }

        // 会话已由 authStore 写进 localStorage；replace：登录页不留在历史里
        navigate(nextPath, { replace: true })
      } catch (error) {
        if (error instanceof ApiError) {
          const field = FIELD_BY_ERROR_CODE[error.code]
          if (field) {
            setErrors({ [field]: error.message })
          } else if (error.code === 40101) {
            // 后端不区分「邮箱不存在」和「密码错」，这里也不要自作聪明提示得更细
            setFormError('邮箱或密码不正确，请检查后重试')
          } else {
            setFormError(error.message)
          }
        } else {
          setFormError('操作失败，请稍后重试')
        }
        setSubmitting(false)
      }
    },
    [mode, form, submitting, navigate, nextPath, signIn, signUp],
  )

  const isRegister = mode === 'register'
  const submitLabel = isRegister ? '注册并登录' : '登录'

  // 已登录用户直接去目标页（例如点错又点回 /login）
  if (status === 'authenticated') {
    return <Navigate to={nextPath} replace />
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={isRegister ? '注册' : '登录'}
        titleAs="h2"
        // 返回 = 放弃登录，回到刚才想去的页面（没有 next 就回首页）
        to={safeNextPath(searchParams.get('next'), ROUTES.home)}
        backLabel="返回上一页"
      />

      <main className={styles.main}>
        <section className={styles.card}>
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">
              <SparklesIcon size={20} />
            </span>
            <div className={styles.brandText}>
              <h1 className={styles.title}>{isRegister ? '加入手帐集市' : '欢迎回到手帐集市'}</h1>
              <p className={styles.subtitle}>
                {isRegister
                  ? '注册一个账号，收藏喜欢的商品、发布你的手作。'
                  : '登录后可以收藏商品、查看订单和个人主页。'}
              </p>
            </div>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="登录或注册">
            <button
              type="button"
              role="tab"
              aria-selected={!isRegister}
              className={isRegister ? styles.tab : `${styles.tab} ${styles.tabActive}`}
              onClick={() => switchMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegister}
              className={isRegister ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              onClick={() => switchMode('register')}
            >
              注册
            </button>
          </div>

          {/* 三种说明：重置密码后的提示 / 登录过期 / 被登录闸门拦下 */}
          {(stateNotice !== null ||
            expiredReason !== null ||
            (intent !== null && !isRegister)) && (
            <p className={styles.notice} role="status">
              {stateNotice ?? expiredReason ?? `登录后即可${intent}`}
            </p>
          )}

          <form className={styles.form} onSubmit={(event) => void handleSubmit(event)} noValidate>
            {isRegister && (
              <label className={styles.field} htmlFor="auth-nickname">
                <span className={styles.label}>
                  昵称<span className={styles.optional}>选填</span>
                </span>
                <span className={styles.inputWrap}>
                  <UserIcon size={16} className={styles.inputIcon} />
                  <input
                    id="auth-nickname"
                    className={inputClass(Boolean(errors.nickname))}
                    value={form.nickname}
                    maxLength={NICKNAME_MAX}
                    autoComplete="nickname"
                    placeholder="怎么称呼你？留空就用邮箱前缀"
                    aria-invalid={Boolean(errors.nickname)}
                    aria-describedby={errors.nickname ? 'auth-nickname-error' : undefined}
                    onChange={(event) => updateField('nickname', event.target.value)}
                  />
                </span>
                {errors.nickname && (
                  <span className={styles.fieldError} id="auth-nickname-error">
                    {errors.nickname}
                  </span>
                )}
              </label>
            )}

            <label className={styles.field} htmlFor="auth-email">
              <span className={styles.label}>邮箱</span>
              <span className={styles.inputWrap}>
                <MailIcon size={16} className={styles.inputIcon} />
                <input
                  id="auth-email"
                  className={inputClass(Boolean(errors.email))}
                  value={form.email}
                  type="email"
                  inputMode="email"
                  maxLength={EMAIL_MAX}
                  autoComplete="email"
                  placeholder="name@example.com"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'auth-email-error' : undefined}
                  onChange={(event) => updateField('email', event.target.value)}
                />
              </span>
              {errors.email && (
                <span className={styles.fieldError} id="auth-email-error">
                  {errors.email}
                </span>
              )}
            </label>

            <label className={styles.field} htmlFor="auth-password">
              <span className={styles.label}>密码</span>
              <span className={styles.inputWrap}>
                <LockIcon size={16} className={styles.inputIcon} />
                <input
                  id="auth-password"
                  className={`${inputClass(Boolean(errors.password))} ${styles.inputWithAction}`}
                  value={form.password}
                  type={showPassword ? 'text' : 'password'}
                  maxLength={PASSWORD_MAX}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder={`${PASSWORD_MIN}–${PASSWORD_MAX} 位`}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'auth-password-error' : undefined}
                  onChange={(event) => updateField('password', event.target.value)}
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
              {errors.password && (
                <span className={styles.fieldError} id="auth-password-error">
                  {errors.password}
                </span>
              )}
              {isRegister && !errors.password && (
                <span className={styles.fieldHint}>至少 {PASSWORD_MIN} 位，建议字母加数字</span>
              )}
              {!isRegister && (
                <span className={styles.fieldFooter}>
                  <Link className={styles.textLink} to={ROUTES.forgotPassword}>
                    忘记密码？
                  </Link>
                </span>
              )}
            </label>

            {isRegister && (
              <label className={styles.field} htmlFor="auth-confirm">
                <span className={styles.label}>确认密码</span>
                <span className={styles.inputWrap}>
                  <LockIcon size={16} className={styles.inputIcon} />
                  <input
                    id="auth-confirm"
                    className={inputClass(Boolean(errors.confirm))}
                    value={form.confirm}
                    type={showPassword ? 'text' : 'password'}
                    maxLength={PASSWORD_MAX}
                    autoComplete="new-password"
                    placeholder="再输入一次密码"
                    aria-invalid={Boolean(errors.confirm)}
                    aria-describedby={errors.confirm ? 'auth-confirm-error' : undefined}
                    onChange={(event) => updateField('confirm', event.target.value)}
                  />
                </span>
                {errors.confirm && (
                  <span className={styles.fieldError} id="auth-confirm-error">
                    {errors.confirm}
                  </span>
                )}
              </label>
            )}

            {formError && (
              <p className={styles.formError} role="alert">
                {formError}
              </p>
            )}

            <button type="submit" className={styles.submit} disabled={submitting}>
              {submitting ? (isRegister ? '注册中…' : '登录中…') : submitLabel}
            </button>
          </form>

          {!isRegister && (
            <div className={styles.demo}>
              <div className={styles.demoText}>
                <strong>演示账号</strong>
                <span>
                  {DEMO_ACCOUNT.email} · {DEMO_ACCOUNT.password}
                </span>
              </div>
              <button type="button" className={styles.demoBtn} onClick={fillDemo}>
                一键填入
              </button>
            </div>
          )}

          <p className={styles.switch}>
            {isRegister ? '已经有账号了？' : '还没有账号？'}
            <button
              type="button"
              className={styles.switchBtn}
              onClick={() => switchMode(isRegister ? 'login' : 'register')}
            >
              {isRegister ? '去登录' : '立即注册'}
            </button>
          </p>

          <p className={styles.footnote}>
            密码会加盐哈希后保存，登录凭证 7 天有效；本页面仅用于课程演示。
          </p>
        </section>
      </main>

      <BottomNavBar cartCount={cartCount} />
    </div>
  )
}
