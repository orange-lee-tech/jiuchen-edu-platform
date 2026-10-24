import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const source = path.join(root, 'apps', 'miniprogram')
const runtime = path.join(root, 'runtime')
const target = path.join(runtime, 'miniprogram')
const apiUrl = process.env.ACCEPTANCE_HTTPS_URL
const token = process.env.ACCEPTANCE_TOKEN
if (!/^https:\/\/[a-z0-9.-]+$/.test(apiUrl || '') || !token || token.length < 40) {
  throw new Error('valid acceptance HTTPS URL and private token are required')
}
if (path.dirname(target) !== runtime) throw new Error('unsafe generated project path')
fs.mkdirSync(runtime, { recursive: true })
fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, {
  recursive: true,
  filter: (item) => !['node_modules', 'project.private.config.json', '.git'].includes(path.basename(item)),
})

const mini = path.join(target, 'miniprogram')
const requestFile = path.join(mini, 'utils', 'request.ts')
let requestSource = fs.readFileSync(requestFile, 'utf8')
const importBefore = "import { runtimeConfig } from '../config/runtime'"
if (!requestSource.includes(importBefore)) throw new Error('request import changed')
requestSource = requestSource.replace(importBefore,
  "import { runtimeConfig, acceptanceHeaders } from '../config/runtime'")
const headerBefore = 'header: {...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),...viewHeader},'
if (!requestSource.includes(headerBefore)) throw new Error('request header changed')
requestSource = requestSource.replace(headerBefore,
  'header: {...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),...viewHeader,...acceptanceHeaders()},')
fs.writeFileSync(requestFile, requestSource)

const cloudUploadFile = path.join(mini, 'utils', 'cloud-upload.ts')
let cloudUploadSource = fs.readFileSync(cloudUploadFile, 'utf8')
const cloudUploadImport = "import { getSavedAuthResult } from './auth'"
if (!cloudUploadSource.includes(cloudUploadImport)) throw new Error('cloud upload import changed')
cloudUploadSource = cloudUploadSource.replace(cloudUploadImport,
  cloudUploadImport + "\nimport { runtimeConfig } from '../config/runtime'")
cloudUploadSource = cloudUploadSource.replace(
  '  const auth = getSavedAuthResult()',
  "  if (!runtimeConfig.cloudEnvId) return Promise.reject(new Error('隔离验收环境禁止 CloudBase 上传'))\n  const auth = getSavedAuthResult()",
)
fs.writeFileSync(cloudUploadFile, cloudUploadSource)

fs.writeFileSync(path.join(mini, 'config', 'runtime.ts'), `
export type ApiTransport = 'ecs' | 'cloudrun' | 'local'
export const LOCAL_API_DEBUG_STORAGE_KEY = 'jiuchen-use-local-api'
export const CLOUDRUN_API_DEBUG_STORAGE_KEY = 'jiuchen-use-cloudrun-api'
export const ACCEPTANCE_ROLE_KEY = 'jiuchen-device-acceptance-role'
export function acceptanceHeaders(): Record<string,string> {
  const role = String(wx.getStorageSync(ACCEPTANCE_ROLE_KEY) || '')
  return {
    'X-Acceptance-Token': ${JSON.stringify(token)},
    ...(role ? { 'X-Acceptance-Identity': role } : {}),
  }
}
export const runtimeConfig = {
  apiTransport: 'ecs' as ApiTransport,
  apiBaseUrl: ${JSON.stringify(apiUrl)},
  cloudEnvId: '',
  cloudServiceName: '',
  wechatCustomerService: { corpId: '', url: '' },
} as const
`)

const appFile = path.join(mini, 'app.ts')
let appSource = fs.readFileSync(appFile, 'utf8')
appSource = "import { clearSavedAuthResult } from './utils/auth'\n" +
  appSource.replace('onLaunch() {', 'onLaunch() {\n    clearSavedAuthResult()')
fs.writeFileSync(appFile, appSource)

const appJsonFile = path.join(mini, 'app.json')
const appJson = JSON.parse(fs.readFileSync(appJsonFile, 'utf8'))
appJson.pages.unshift('pages/acceptance/acceptance')
appJson.window.navigationBarTitleText = '【隔离测试】九辰保研'
appJson.tabBar.list.push({
  pagePath: 'pages/acceptance/acceptance',
  text: '测试身份',
  iconPath: 'assets/icons/mine-normal.png',
  selectedIconPath: 'assets/icons/mine-active.png',
})
fs.writeFileSync(appJsonFile, JSON.stringify(appJson, null, 2) + '\n')

const pageDir = path.join(mini, 'pages', 'acceptance')
fs.mkdirSync(pageDir, { recursive: true })
fs.writeFileSync(path.join(pageDir, 'acceptance.ts'), `
import { clearSavedAuthResult } from '../../utils/auth'
import { ACCEPTANCE_ROLE_KEY, runtimeConfig } from '../../config/runtime'
Page({
  data: { role: '', url: runtimeConfig.apiBaseUrl },
  onShow() { this.setData({ role: String(wx.getStorageSync(ACCEPTANCE_ROLE_KEY) || '') }) },
  selectRole(event: WechatMiniprogram.CustomEvent) {
    const role = String(event.currentTarget.dataset.role || '')
    if (!['admin', 'student', 'teacher'].includes(role)) return
    clearSavedAuthResult()
    wx.setStorageSync(ACCEPTANCE_ROLE_KEY, role)
    this.setData({ role })
    wx.switchTab({ url: '/pages/index/index' })
  },
})
`)
fs.writeFileSync(path.join(pageDir, 'acceptance.wxml'), `
<view class="acceptance">
  <view class="warning">隔离验收环境 · 合成数据 · 非生产</view>
  <text class="hint">本项目不连接生产 CloudBase，不发起真实支付。评估模型为模拟端点，结果不用于申请决策。</text>
  <text class="hint" selectable>测试 API：{{url}}</text>
  <text class="hint">当前身份：{{role || '尚未选择'}}</text>
  <button data-role="admin" bindtap="selectRole">以管理员进入</button>
  <button data-role="student" bindtap="selectRole">以学员进入</button>
  <button data-role="teacher" bindtap="selectRole">以老师进入</button>
  <text class="hint">切换身份会清除本机当前会话。进入后按正常登录流程同意协议即可。</text>
</view>
`)
fs.writeFileSync(path.join(pageDir, 'acceptance.wxss'), `
.acceptance { padding: 40rpx; display: flex; flex-direction: column; gap: 24rpx; }
.warning { padding: 24rpx; background: #a21d24; color: white; font-size: 32rpx; font-weight: 700; border-radius: 12rpx; }
.hint { color: #454545; font-size: 26rpx; line-height: 1.6; word-break: break-all; }
button { width: 100%; }
`)
fs.writeFileSync(path.join(pageDir, 'acceptance.json'), '{"navigationBarTitleText":"隔离验收身份"}\n')

const projectFile = path.join(target, 'project.config.json')
const project = JSON.parse(fs.readFileSync(projectFile, 'utf8'))
project.projectname = 'jiuchen-device-acceptance-TEST'
project.description = '隔离验收版，禁止上传为正式版'
project.setting = { ...project.setting, urlCheck: false }
fs.writeFileSync(projectFile, JSON.stringify(project, null, 2) + '\n')
console.log(JSON.stringify({ project: target, url: apiUrl }))
