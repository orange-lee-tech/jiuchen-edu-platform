import { refreshAuthResult, type AuthState } from '../../utils/auth'
import { loginFor, observeShell, openSlot, routeAllowed, stopPageAuthorization, validateIntent } from '../../utils/navigation'

type ProtectedPage = ReturnType<typeof getCurrentPages>[number]
const contexts = new WeakMap<object, { page: ProtectedPage; owner: string | null; stop?: () => void }>()

Component({
  data: { visible: true, phase: 'loading', title: '正在确认访问权限', message: '确认后会显示当前账号的内容。', needsLogin: false },
  lifetimes: {
    attached() { contexts.set(this, { page: getCurrentPages().slice(-1)[0], owner: null }); this.watchAuth() },
    detached() { const context = contexts.get(this); context?.stop?.(); if (context) stopPageAuthorization(context.page); contexts.delete(this) },
  },
  pageLifetimes: {
    show() { this.watchAuth() },
    hide() { this.setData({ visible: true, phase: 'loading' }) },
  },
  methods: {
    onBlockedTouch() {},
    watchAuth() {
      const context = contexts.get(this)
      if (!context) return
      context.stop?.()
      context.stop = observeShell((state: AuthState) => {
        const page = context.page
        const options = (page as unknown as { options?: Record<string, string> })?.options || {}
        const validLink = Boolean(validateIntent(page?.route || '', options))
        const sameAccount = !context.owner || context.owner === state.auth?.user.id
        const allowed = state.phase === 'ready' && validLink && sameAccount && routeAllowed(page?.route || '', state.auth?.user.role, options)
        if (allowed && state.auth) {
          context.owner = state.auth.user.id
          this.triggerEvent('validated', { role: state.auth.user.role })
        }
        this.setData({ visible: !allowed, phase: state.phase, needsLogin: validLink && state.phase === 'ready' && !state.auth, title: state.phase === 'loading' ? '正在确认访问权限' : !validLink ? '页面链接无法识别' : !state.auth && state.phase === 'ready' ? '登录后继续' : state.phase === 'error' ? '暂时无法确认身份' : '当前身份无法进入此页面', message: state.message || (state.auth ? '可以返回“我的”，查看当前身份与可用入口。' : '登录成功后继续查看；不会自动执行评估或保存操作。') })
      })
    },
    onRetry() { void refreshAuthResult() },
    onLogin() {
      const context = contexts.get(this)
      if (context) loginFor(context.page.route, (context.page as unknown as { options: Record<string, string> }).options || {}, true, context.owner)
    },
    onMine() { openSlot('mine') },
  },
})
