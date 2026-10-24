import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'

const listenPort = Number(process.env.ACCEPTANCE_PROXY_PORT || 3312)
const apiPort = Number(process.env.ACCEPTANCE_API_PORT || 3311)
const token = process.env.ACCEPTANCE_TOKEN || ''
if (process.env.NODE_ENV !== 'test' || token.length < 40) {
  throw new Error('acceptance proxy requires NODE_ENV=test and a private random token')
}

const identities = Object.freeze({
  admin: 'device-acceptance-admin',
  student: 'device-acceptance-student',
  teacher: 'device-acceptance-teacher',
})

function authorized(candidate) {
  if (typeof candidate !== 'string') return false
  const received = Buffer.from(candidate)
  const expected = Buffer.from(token)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-jiuchen-environment': 'device-acceptance',
  })
  response.end(JSON.stringify(value))
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Error('request_too_large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function mockAssessment(prompt, model) {
  const marker = '请根据以下结构化输入、允许的输入引用和证据快照完成评估：\n'
  const source = String(prompt || '')
  const position = source.lastIndexOf(marker)
  const parsed = position >= 0 ? JSON.parse(source.slice(position + marker.length)) : null
  const targets = parsed?.assessment?.targets
  if (!Array.isArray(targets) || targets.length === 0) return { ok: true }
  return {
    profileSummary: `隔离环境模拟评估（${model}）：仅验证流程，不提供招生结论。`,
    strengths: [],
    risks: [],
    targetAssessments: targets.map((target, index) => ({
      schoolName: target.schoolName,
      programName: target.programName ?? null,
      tier: 'insufficient_data',
      rationale: '这是隔离环境模拟结果；缺少可核验的院校证据，不能作出录取判断。',
      gapItems: [],
      actions: [],
      evidenceRefs: [`input:target:${index + 1}`],
    })),
    recommendedActions: [],
    similarCases: [],
    uncertainties: ['隔离环境使用模拟模型；请勿将本结果用于实际申请决策。'],
    disclaimer: '隔离验收模拟输出，不代表录取承诺或真实模型表现。',
  }
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname
  if (pathname === '/health/live' && request.method === 'GET') {
    return sendJson(response, 200, { ok: true, service: 'jiuchen-device-acceptance', environment: 'test' })
  }
  if (pathname === '/mock-ai/v1/chat/completions' && request.method === 'POST') {
    if (!/^Bearer acceptance-model-[a-zA-Z0-9_-]{1,48}$/.test(String(request.headers.authorization || ''))) {
      return sendJson(response, 401, { error: 'mock_model_key_required' })
    }
    try {
      const body = await readJson(request)
      const model = String(body?.model || '').slice(0, 80)
      const prompt = body?.messages?.findLast?.((entry) => entry?.role === 'user')?.content
      const output = mockAssessment(prompt, model)
      console.log(JSON.stringify({ event: 'mock_model_called', model, at: new Date().toISOString() }))
      return sendJson(response, 200, { choices: [{ message: { content: JSON.stringify(output) } }] })
    } catch {
      return sendJson(response, 400, { error: 'mock_model_bad_request' })
    }
  }
  if (!authorized(request.headers['x-acceptance-token'])) {
    return sendJson(response, 403, { ok: false, error: 'acceptance_token_required' })
  }

  const headers = { ...request.headers }
  delete headers['x-acceptance-token']
  delete headers['x-acceptance-identity']
  delete headers['x-wx-openid']
  delete headers['x-wx-unionid']
  delete headers.host
  if (pathname === '/auth/wechat/bootstrap' || pathname === '/auth/phone/bootstrap') {
    const role = String(request.headers['x-acceptance-identity'] || '')
    if (!Object.hasOwn(identities, role)) {
      return sendJson(response, 400, { ok: false, error: 'acceptance_identity_required' })
    }
    headers['x-wx-openid'] = identities[role]
  }
  const upstream = http.request({
    hostname: '127.0.0.1', port: apiPort, path: request.url,
    method: request.method, headers,
  }, (upstreamResponse) => {
    const outbound = { ...upstreamResponse.headers,
      'cache-control': 'no-store', 'x-jiuchen-environment': 'device-acceptance' }
    response.writeHead(upstreamResponse.statusCode || 502, outbound)
    upstreamResponse.pipe(response)
  })
  upstream.on('error', () => sendJson(response, 502, { ok: false, error: 'acceptance_api_unavailable' }))
  request.pipe(upstream)
})

server.listen(listenPort, '127.0.0.1', () => {
  console.log(JSON.stringify({ event: 'acceptance_proxy_ready', port: listenPort }))
})
