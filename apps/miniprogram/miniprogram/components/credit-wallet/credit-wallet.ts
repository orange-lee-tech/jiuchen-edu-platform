import { getSavedAuthResult } from '../../utils/auth'
import {
  friendlyRequestError, getCommercialMeta, grantMyFreeCredits, getMyCreditAccount,
  getMyVirtualPurchaseOrders, requestVirtualPurchaseAfterSales,
  createVirtualAssessmentOrder, endUnpaidVirtualAssessmentOrder,
  reconcileVirtualAssessmentOrder, type VirtualPurchaseOrder,
} from '../../utils/request'

const freeCreditGrants = new Map<string, Promise<void>>()
function ensureFreeCredits() {
  const owner = getSavedAuthResult()?.user.id || ''
  if (!owner) return Promise.resolve()
  let pending = freeCreditGrants.get(owner)
  if (!pending) {
    pending = grantMyFreeCredits().then(() => undefined).catch(error => { freeCreditGrants.delete(owner); throw error })
    freeCreditGrants.set(owner, pending)
  }
  return pending
}

const virtualOrderKey = (owner = getSavedAuthResult()?.user.id || 'none') => 'jiuchen:virtual-order:' + owner
const virtualOrderFailureKey = (owner = getSavedAuthResult()?.user.id || 'none') => 'jiuchen:virtual-order-failure:' + owner
function clearVirtualOrderMarkers(id:string, owner?: string) {
  if(wx.getStorageSync(virtualOrderKey(owner))===id) wx.removeStorageSync(virtualOrderKey(owner))
  const failure=wx.getStorageSync(virtualOrderFailureKey(owner))
  if(failure?.orderId===id) wx.removeStorageSync(virtualOrderFailureKey(owner))
}

function virtualPaymentFailureDetail(error: unknown) {
  const result = error && typeof error === 'object' ? error as { errCode?: unknown; errMsg?: unknown } : {}
  const code = String(result.errCode ?? '')
  const safeCode = /^-?\d{1,10}$/.test(code) ? code : '未提供'
  const rawMessage = typeof result.errMsg === 'string' ? result.errMsg.trim() : ''
  const message = rawMessage.replace(/^requestVirtualPayment:/, '').trim()
  // Platform error text is untrusted. Never echo URLs, credentials or long opaque tokens.
  const safeMessage = message.length > 0 && message.length <= 70 &&
    !/[\r\n?&=<>]/.test(message) &&
    !/https?:|sign|secret|token|session|openid|authorization|api.?key|[a-z\d+/_-]{16,}/i.test(message)
      ? message : '微信未提供可安全展示的简短原因'
  const advice = safeCode === '-15013' ? '\n微信道具价格与当前购买金额不一致，请等待商品配置核对。' : ''
  return `微信错误码：${safeCode}\n微信提示：${safeMessage}${advice}`
}

Component({
  properties: { mode: { type: String, value: 'full' }, accountId: { type: String, value: '', observer() { this.restorePending(); void this.loadCredits() } } },
  data: {
    billingEnabled: false, checkoutEnabled: false, creditAvailable: null as number | null,
    purchaseOrders: [] as Array<VirtualPurchaseOrder & {amountYuan:string;statusLabel:string}>,
    purchaseOrderError: '', creditError: '', creditLoading: false,
    purchasing: false, verifyingPayment: false, endingPayment: false,
    pendingPaymentOrderId: '', canEndPendingOrder: false,
    skuChoices: [] as Array<{ key: string; price: string; count: number }>,
    offersOpen: false, ordersOpen: false, lastLoadedAt: 0, activeOwner: '',
  },
  lifetimes: { attached() { this.restorePending(); void this.loadCredits() } },
  pageLifetimes: { show() { this.restorePending(); if (Date.now() - this.data.lastLoadedAt > 30000) void this.loadCredits() } },
  methods: {
    syncOwner() {
      const owner = this.data.accountId || getSavedAuthResult()?.user.id || ''
      if (owner !== this.data.activeOwner) this.setData({ activeOwner: owner, pendingPaymentOrderId: '', canEndPendingOrder: false,
        purchaseOrders: [], purchaseOrderError: '', creditAvailable: null, creditLoading: false, lastLoadedAt: 0, ordersOpen: false, offersOpen: false })
      return owner
    },
    restorePending() {
      const owner = this.syncOwner()
      const id = wx.getStorageSync(virtualOrderKey(owner))
      if (typeof id === 'string' && id && !this.data.pendingPaymentOrderId) this.setData({ pendingPaymentOrderId: id })
      this.setData({ canEndPendingOrder: Boolean(id) })
    },
    refresh() { void this.loadCredits() },
    openPurchasePanel() { this.setData({ offersOpen: true }); if (!this.data.billingEnabled && !this.data.creditLoading) void this.loadCredits() },
    onToggleOffers() { this.setData({ offersOpen: !this.data.offersOpen }) },
    onToggleOrders() {
      const ordersOpen = !this.data.ordersOpen
      this.setData({ ordersOpen })
      if (ordersOpen) void this.loadPurchaseOrders()
    },
  async loadCredits() {
    const owner = this.syncOwner()
    if (!owner) return
    if (this.data.creditLoading || this.data.purchasing) return
    try {
      this.setData({ creditLoading: true, creditError: '' })
      const meta = await getCommercialMeta()
      if (owner !== this.data.activeOwner) return
      if (!meta.policy.enforcementEnabled) {
        this.setData({ billingEnabled: false, checkoutEnabled: false, creditAvailable: null, skuChoices: [] })
        return
      }
      // Chargeable plans and prices are server-owned, not submitted by the client.
      const isIos = wx.getSystemInfoSync().platform === 'ios'
      const skuChoices = meta.payment.skus.filter(sku => sku.key !== 'JC000' || !isIos).map(sku => ({
        key: sku.key, count: sku.creditAmount, price: (sku.amountFen / 100).toFixed(2),
      }))
      this.setData({ billingEnabled: true, checkoutEnabled: meta.payment.checkoutEnabled, skuChoices })
      // An idempotent server grant supports both guest=1 and student=5 lifetime policy.
      await ensureFreeCredits()
      if (owner !== this.data.activeOwner) return
      const creditAccount = await getMyCreditAccount()
      if (owner !== this.data.activeOwner) return
      this.setData({ creditAvailable: creditAccount.availableBalance, lastLoadedAt: Date.now() })
    } catch (error) {
      if (owner === this.data.activeOwner) this.setData({ creditAvailable: null, creditError: friendlyRequestError(error, '额度读取失败，请重试') })
    } finally {
      if (owner === this.data.activeOwner) this.setData({ creditLoading: false })
    }
  },
  async loadPurchaseOrders() {
    const owner = this.syncOwner()
    if (!owner) return
    try {
      const orders=await getMyVirtualPurchaseOrders()
      if (owner !== this.data.activeOwner) return
      const labels:Record<string,string>={pending:'待核实',paid:'已付款',
        closed:'已结束',refunded:'已退款'}
      this.setData({purchaseOrderError:'',purchaseOrders:orders.map(order=>({
        ...order,amountYuan:(order.amountFen/100).toFixed(2),
        statusLabel:labels[order.status]??'待核实',
      }))})
    } catch(error) {
      if (owner === this.data.activeOwner) this.setData({purchaseOrderError:friendlyRequestError(error,'购买订单读取失败，请重试')})
    }
  },
  onRequestAfterSales(event:WechatMiniprogram.BaseEvent) {
    const id=String(event.currentTarget.dataset.id||'')
    const order=this.data.purchaseOrders.find(item=>item.id===id)
    if(!order || order.status!=='paid')return
    wx.showModal({title:'申请售后核对',
      content:'这会提交人工核对请求，不会立即退款或扣回次数。安卓订单由九辰客服核对；iOS 请同时到 App Store 购买记录申请退款。',
      confirmText:'提交核对',success:result=>{if(result.confirm)void this.requestAfterSales(id)}})
  },
  async requestAfterSales(id:string) {
    try {await requestVirtualPurchaseAfterSales(id);await this.loadPurchaseOrders()
      wx.showToast({title:'售后请求已记录',icon:'success'})}
    catch(error){wx.showToast({title:friendlyRequestError(error,'售后请求失败'),icon:'none'})}
  },
  onBuyCredit(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.checkoutEnabled || this.data.purchasing || this.data.verifyingPayment || this.data.endingPayment) return
    const key = String(event.currentTarget.dataset.key ?? '')
    const sku = this.data.skuChoices.find(item => item.key === key)
    if (!sku) return
    wx.showModal({
      title: '购买 AI 评估次数',
      content: `确认购买 ${sku.count} 次 AI 评估，支付 ¥${sku.price}？`,
      confirmText: '微信支付',
      cancelText: '暂不购买',
      success: result => { if (result.confirm) void this.beginCreditPurchase(sku.key) },
    })
  },
  async beginCreditPurchase(skuKey: string) {
    const owner = this.syncOwner()
    if (this.data.purchasing || this.data.verifyingPayment || this.data.endingPayment || !this.data.checkoutEnabled) return
    const pendingId = this.data.pendingPaymentOrderId || wx.getStorageSync(virtualOrderKey(owner))
    if (pendingId) {
      this.setData({pendingPaymentOrderId:pendingId})
      wx.showModal({title:'请先核实上一笔订单',content:'上一笔订单仍待微信确认。请先核实订单状态；即使已超过付款时限，也不要直接重新下单，以免重复付款。',showCancel:false})
      return
    }
    this.setData({purchasing:true})
    let stage: 'create' | 'invoke' | 'query' = 'create'
    try {
      const code=await new Promise<string>((resolve,reject)=>{
        wx.login({success:result=>result.code?resolve(result.code):reject(new Error('wechat_login_missing')),fail:reject})
      })
      if (owner !== this.data.activeOwner) return
      const {order,payment}=await createVirtualAssessmentOrder(skuKey,code)
      wx.setStorageSync(virtualOrderKey(owner),order.id)
      if (owner !== this.data.activeOwner) return
      this.setData({pendingPaymentOrderId:order.id,canEndPendingOrder:false})
      stage = 'invoke'
      const api=wx as unknown as {requestVirtualPayment?: (arg:{
        mode:'short_series_goods';signData:string;paySig:string;signature:string;
        success:()=>void;fail:(err:{errCode?:number;errMsg?:string})=>void;
      })=>void}
      if(!api.requestVirtualPayment) throw new Error('当前微信版本不支持虚拟支付，请升级微信')
      await new Promise<void>((resolve,reject)=>
        api.requestVirtualPayment!({...payment,success:resolve,fail:reject}))
      // Device success is NOT proof of payment; only verified WeChat server query
      // may settle an order and idempotently grant evaluation credits.
      stage = 'query'
      await this.verifyCreditPayment()
    } catch(error) {
      if (stage === 'create') {
        wx.showModal({title:'创建订单失败',content:`${friendlyRequestError(error, '暂时无法创建订单，请稍后重试')}。本次未调起微信支付。`,showCancel:false})
      } else if (stage === 'invoke') {
        const errorCode=error && typeof error==='object' ? (error as {errCode?:unknown}).errCode : undefined
        const id=this.data.pendingPaymentOrderId
        if(id) {
          wx.setStorageSync(virtualOrderFailureKey(owner),{orderId:id,code:errorCode})
          this.setData({canEndPendingOrder:true})
        }
        const detail = error instanceof Error && error.message === '当前微信版本不支持虚拟支付，请升级微信'
          ? error.message : virtualPaymentFailureDetail(error)
        wx.showModal({
          title: '微信支付未完成',
          content: `${detail}\n如确认收银台未打开、没有付款，可在订单付款窗口结束后申请结束此订单；状态未知时请先核实。`,
          showCancel: false,
        })
      } else {
        wx.showModal({
          title: '官方查单未完成',
          content: '微信支付已返回，但官方订单状态暂无法确认。请稍后核实上一笔订单；勿重复购买。',
          showCancel: false,
        })
      }
    } finally {
      this.setData({purchasing:false})
      void this.loadCredits()
    }
  },
  async verifyCreditPayment() {
    const owner = this.data.activeOwner
    const id=this.data.pendingPaymentOrderId
    if(!id)return
    const result=await reconcileVirtualAssessmentOrder(id)
    if (owner !== this.data.activeOwner) {
      if ((result.state === 'paid' && result.credited && !result.deliveryPending) || result.state === 'refunded' || result.state === 'closed') clearVirtualOrderMarkers(id, owner)
      return
    }
    if(result.state==='paid' && result.credited && !result.deliveryPending) {
      if(this.data.pendingPaymentOrderId===id) this.setData({pendingPaymentOrderId:''})
      clearVirtualOrderMarkers(id, owner)
      this.setData({canEndPendingOrder:false})
      wx.showToast({title:'评估次数已到账',icon:'success'})
    } else if(result.state==='paid' && result.credited && result.deliveryPending) {
      wx.showModal({title:'次数已到账',content:'微信发货确认仍在处理中，请稍后再次核实本订单，无需重复付款。',showCancel:false})
    } else if(result.requiresFinanceReview) {
      wx.showModal({title:'订单需要人工核对',content:'微信显示付款后退款或关闭，已发放的次数需人工对账。请勿重复付款，并联系九辰客服。',showCancel:false})
    } else if(result.state==='refunded' || result.state==='closed') {
      if(this.data.pendingPaymentOrderId===id) this.setData({pendingPaymentOrderId:''})
      clearVirtualOrderMarkers(id, owner)
      this.setData({canEndPendingOrder:false})
      wx.showModal({title:'购买订单已结束',content:result.state==='refunded'
        ? '订单已退款，未增加评估次数。可重新选择商品。'
        : '订单已关闭，未增加评估次数。可重新选择商品。',showCancel:false})
    } else {
      wx.showModal({
        title:'支付状态核实',
        content:'微信暂未确认付款，请稍后点击“核实上一笔购买订单”。',
        showCancel:false,
      })
    }
  },
  onVerifyCreditPayment() {
    if(this.data.purchasing || this.data.verifyingPayment || this.data.endingPayment)return
    this.setData({verifyingPayment:true})
    void this.verifyCreditPayment()
      .catch(()=>wx.showModal({title:'官方查单未完成',content:'微信官方暂未返回可确认的订单状态。请稍后重试；若超过付款时限仍无法确认，请联系九辰客服核查，勿重复付款。',showCancel:false}))
      .finally(()=>{this.setData({verifyingPayment:false});void this.loadCredits()})
  },
  onEndUnpaidPayment() {
    if (!this.data.pendingPaymentOrderId || !this.data.canEndPendingOrder) {
      wx.showToast({ title:'当前没有可处理的未完成订单', icon:'none' })
      return
    }
    if (this.data.purchasing || this.data.verifyingPayment || this.data.endingPayment) {
      wx.showModal({
        title:'订单操作进行中',
        content:'当前订单正在处理中，操作结束后再点击。不要重复付款。',
        showCancel:false,
      })
      return
    }
    wx.showModal({title:'结束未完成购买',
      content:'仅在确认没有付款时使用。服务端会等待原付款窗口结束，并核对微信订单、到账及发货记录；无法确认时不会解除购买保护。',
      confirmText:'确认结束',cancelText:'返回核实',
      success:result=>{if(result.confirm) void this.endUnpaidPayment()},
    })
  },
  async endUnpaidPayment() {
    const owner = this.data.activeOwner
    const id=this.data.pendingPaymentOrderId
    if(!id || !this.data.canEndPendingOrder || this.data.endingPayment || this.data.purchasing || this.data.verifyingPayment) return
    this.setData({endingPayment:true})
    try {
      const result=await endUnpaidVirtualAssessmentOrder(id)
      if (owner !== this.data.activeOwner) { if (result.state === 'closed' && !result.credited) clearVirtualOrderMarkers(id, owner); return }
      if(result.state!=='closed' || result.credited) throw new Error('virtual_order_payment_review_required')
      if(this.data.pendingPaymentOrderId===id) this.setData({pendingPaymentOrderId:'',canEndPendingOrder:false})
      clearVirtualOrderMarkers(id, owner)
      wx.showModal({title:'未付款订单已结束',content:'订单记录已保留，未增加评估次数。现在可以重新选择商品。',showCancel:false})
    } catch(error) {
      const code=error && typeof error==='object' ? String((error as {message?:unknown}).message||'') : ''
      wx.showModal({title:'订单尚不能结束',content:code.includes('virtual_order_checkout_window_open')
        ? '原订单的 30 分钟付款窗口尚未结束，请稍后再试。期间不要重复付款。'
        : '微信订单或到账状态尚不能安全确认，请先核实订单；如持续无法确认，请联系九辰客服。',showCancel:false})
    } finally {this.setData({endingPayment:false});void this.loadCredits()}
  },
  },
})
