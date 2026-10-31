// Text Chat Completions IDs and HTTPS bases checked against provider API docs
// on 2026-10-30. Availability still depends on the administrator's account,
// region and entitlement; the real report-format probe decides usability.
export type AiServicePreset = {
  id: string; name: string; baseUrl: string; note: string
  temperatureSupported: boolean
  models: Array<{ id: string; label: string }>
}

export const AI_SERVICE_PRESETS: AiServicePreset[] = [
  { id: 'aliyun-bailian', name: '阿里云百炼 · 千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    note: '中国内地默认地址；其他地域请按百炼工作空间修改。', temperatureSupported: true,
    models: [{ id: 'qwen3.8-max', label: 'Qwen3.8-Max · qwen3.8-max · 文本推理' },
      { id: 'qwen3.7-plus', label: 'Qwen3.7-Plus · qwen3.7-plus · 文本生成' },
      { id: 'qwen3.8-flash', label: 'Qwen3.8-Flash · qwen3.8-flash · 文本生成' },
      { id: 'qwen-plus', label: 'qwen-plus · 兼容型号' }, { id: 'qwen-max', label: 'qwen-max · 兼容型号' }] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
    note: '模型别名会随官方版本升级；严谨度通过九辰评估提示词生效。', temperatureSupported: false,
    models: [{ id: 'deepseek-flash', label: 'DeepSeek V4.1 Flash · deepseek-flash · 文本生成' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro · deepseek-v4-pro · 文本生成' }] },
  { id: 'moonshot', name: '月之暗面 · Kimi', baseUrl: 'https://api.moonshot.cn/v1',
    note: '按账户开通的 Kimi 型号使用；严谨度通过九辰评估提示词生效。', temperatureSupported: false,
    models: [{ id: 'kimi-k3.1-pro', label: 'Kimi K3.1 Pro · kimi-k3.1-pro · 文本推理' }] },
  { id: 'volc-ark', name: '火山方舟 · 豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    note: '北京地域示例；部分账号需填写控制台的 Endpoint ID，请编辑下方模型 ID。', temperatureSupported: false,
    models: [{ id: 'doubao-seed-2-1-pro-260628', label: 'doubao-seed-2-1-pro-260628 · 文本' }] },
  { id: 'tencent-hunyuan', name: '腾讯云 · 混元 TokenHub', baseUrl: 'https://tokenhub.tencentmaas.com/v1',
    note: '旧混元入口已迁移；需 TokenHub API Key 与对应模型权限。', temperatureSupported: false,
    models: [{ id: 'hy3-preview', label: 'hy3-preview · 文本' }] },
  { id: 'baidu-qianfan', name: '百度千帆 · 文心', baseUrl: 'https://qianfan.baidubce.com/v2',
    note: '使用千帆 v2 API Key；模型以账户可用列表为准。', temperatureSupported: true,
    models: [{ id: 'ernie-5.1', label: 'ERNIE 5.1 · ernie-5.1 · 文本生成' }] },
  { id: 'zhipu', name: '智谱 · GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    note: '使用开放平台 API Key；先测试所选型号的报告格式。', temperatureSupported: true,
    models: [{ id: 'glm-5.3', label: 'GLM-5.3 · glm-5.3 · 文本推理' },
      { id: 'glm-5', label: 'GLM-5 · glm-5 · 文本推理' }, { id: 'glm-4.7', label: 'GLM-4.7 · glm-4.7 · 兼容型号' }] },
  { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.io/v1',
    note: '国际站地址；中国内地账号请按控制台提示改为对应 HTTPS 地址。', temperatureSupported: false,
    models: [{ id: 'MiniMax-M3.1-Flash', label: 'MiniMax-M3.1-Flash · 文本生成' },
      { id: 'MiniMax-M3', label: 'MiniMax-M3 · 文本' }] },
  { id: 'xfyun-spark', name: '讯飞星火', baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    note: '输入当前型号对应的 API Password；不同版本凭据可能不同。', temperatureSupported: true,
    models: [{ id: '4.0Ultra', label: '4.0Ultra · 文本' }, { id: 'lite', label: 'lite · 轻量文本' }] },
  { id: 'baichuan', name: '百川智能', baseUrl: 'https://api.baichuan-ai.com/v1',
    note: '需在百川开放平台开通对应模型。', temperatureSupported: true,
    models: [{ id: 'Baichuan4-Turbo', label: 'Baichuan4-Turbo · 文本' },
      { id: 'Baichuan4-Air', label: 'Baichuan4-Air · 轻量文本' }] },
]

export const AI_CATALOG_SOURCES: Record<string, { url: string; verifiedAt: string; note?: string }> = {
  'aliyun-bailian': { url: 'https://www.alibabacloud.com/help/en/model-studio/models', verifiedAt: '2026-10-30' },
  deepseek: { url: 'https://api-docs.deepseek.com/quick_start/pricing/', verifiedAt: '2026-10-30' },
  moonshot: { url: 'https://platform.kimi.com/docs/pricing/chat', verifiedAt: '2026-10-30', note: '详细型号权限以本账号测试为准。' },
  'volc-ark': { url: 'https://www.volcengine.com/docs/82379/1330310', verifiedAt: '2026-10-25', note: '本轮官方目录正文读取失败，保留此前核验型号；可手填 Endpoint ID。' },
  'tencent-hunyuan': { url: 'https://cloud.tencent.com/document/product/1823/131382', verifiedAt: '2026-10-30' },
  'baidu-qianfan': { url: 'https://cloud.baidu.com/doc/qianfan-docs/s/7m95lyy43', verifiedAt: '2026-10-30' },
  zhipu: { url: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3', verifiedAt: '2026-10-30' },
  minimax: { url: 'https://platform.minimax.io/docs/guides/models-intro', verifiedAt: '2026-10-30' },
  'xfyun-spark': { url: 'https://www.xfyun.cn/doc/spark/HTTP调用文档.html', verifiedAt: '2026-10-30' },
  baichuan: { url: 'https://platform.baichuan-ai.com/', verifiedAt: '2026-10-30' },
}

export function aiCatalogNote(preset: AiServicePreset) {
  const source = AI_CATALOG_SOURCES[preset.id]
  return `${preset.note} ${source?.note ?? ''} 官方来源：${source?.url ?? '待核验'}；最近核验：${source?.verifiedAt ?? '未核验'}。`
}

export function rigorToTemperature(rigor: number) {
  return Number(((10 - Math.max(1, Math.min(10, rigor))) / 10).toFixed(1))
}
