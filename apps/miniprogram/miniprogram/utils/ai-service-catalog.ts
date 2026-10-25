// Text Chat Completions IDs and HTTPS bases checked against provider API docs
// on 2026-10-25. Availability still depends on the administrator's account,
// region and entitlement; the real report-format probe decides usability.
export type AiServicePreset = {
  id: string; name: string; baseUrl: string; note: string
  temperatureSupported: boolean
  models: Array<{ id: string; label: string }>
}

export const AI_SERVICE_PRESETS: AiServicePreset[] = [
  { id: 'aliyun-bailian', name: '阿里云百炼 · 千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    note: '中国内地默认地址；其他地域请按百炼工作空间修改。', temperatureSupported: true,
    models: [{ id: 'qwen-plus', label: 'qwen-plus · 通用文本' }, { id: 'qwen-max', label: 'qwen-max · 高能力文本' }] },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
    note: '模型别名会随官方版本升级；严谨度通过九辰评估提示词生效。', temperatureSupported: false,
    models: [{ id: 'deepseek-flash', label: 'deepseek-flash · 快速文本' }, { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro · 复杂文本' }] },
  { id: 'moonshot', name: '月之暗面 · Kimi', baseUrl: 'https://api.moonshot.cn/v1',
    note: '按账户开通的 Kimi 型号使用；严谨度通过九辰评估提示词生效。', temperatureSupported: false,
    models: [{ id: 'kimi-k3.1-pro', label: 'kimi-k3.1-pro · 文本推理' },
      { id: 'kimi-k3.1-pro-highspeed', label: 'kimi-k3.1-pro-highspeed · 高速' }] },
  { id: 'volc-ark', name: '火山方舟 · 豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    note: '北京地域示例；部分账号需填写控制台的 Endpoint ID，请编辑下方模型 ID。', temperatureSupported: false,
    models: [{ id: 'doubao-seed-2-1-pro-260628', label: 'doubao-seed-2-1-pro-260628 · 文本' }] },
  { id: 'tencent-hunyuan', name: '腾讯云 · 混元 TokenHub', baseUrl: 'https://tokenhub.tencentmaas.com/v1',
    note: '旧混元入口已迁移；需 TokenHub API Key 与对应模型权限。', temperatureSupported: false,
    models: [{ id: 'hy3-preview', label: 'hy3-preview · 文本' }] },
  { id: 'baidu-qianfan', name: '百度千帆 · 文心', baseUrl: 'https://qianfan.baidubce.com/v2',
    note: '使用千帆 v2 API Key；模型以账户可用列表为准。', temperatureSupported: true,
    models: [{ id: 'ernie-4.5-turbo-128k', label: 'ernie-4.5-turbo-128k · 文本' }] },
  { id: 'zhipu', name: '智谱 · GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    note: '使用开放平台 API Key；先测试所选型号的报告格式。', temperatureSupported: true,
    models: [{ id: 'glm-4.7', label: 'glm-4.7 · 旗舰文本' }] },
  { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.io/v1',
    note: '国际站地址；中国内地账号请按控制台提示改为对应 HTTPS 地址。', temperatureSupported: false,
    models: [{ id: 'MiniMax-M3.1-Flash', label: 'MiniMax-M3.1-Flash · 快速文本' },
      { id: 'MiniMax-M3', label: 'MiniMax-M3 · 文本' }] },
  { id: 'xfyun-spark', name: '讯飞星火', baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    note: '输入当前型号对应的 API Password；不同版本凭据可能不同。', temperatureSupported: true,
    models: [{ id: '4.0Ultra', label: '4.0Ultra · 文本' }, { id: 'lite', label: 'lite · 轻量文本' }] },
  { id: 'baichuan', name: '百川智能', baseUrl: 'https://api.baichuan-ai.com/v1',
    note: '需在百川开放平台开通对应模型。', temperatureSupported: true,
    models: [{ id: 'Baichuan4-Turbo', label: 'Baichuan4-Turbo · 文本' },
      { id: 'Baichuan4-Air', label: 'Baichuan4-Air · 轻量文本' }] },
]

export function rigorToTemperature(rigor: number) {
  return Number(((10 - Math.max(1, Math.min(10, rigor))) / 10).toFixed(1))
}
