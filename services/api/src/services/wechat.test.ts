import assert from 'node:assert/strict'
import test from 'node:test'
import {
  exchangeWechatLoginCode,
  exchangeWechatPhoneCode,
} from './wechat.js'

const env = {
  NODE_ENV: 'test' as const,
  HOST: '0.0.0.0',
  PORT: 3000,
  WECHAT_APP_ID: 'wx-test-app',
  WECHAT_APP_SECRET: 'test-secret',
}

test('exchangeWechatLoginCode uses official jscode2session endpoint', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input)
    return new Response(
      JSON.stringify({
        openid: 'openid-test',
        session_key: 'session-key-test',
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  }) as typeof fetch

  try {
    const identity = await exchangeWechatLoginCode('login-code', env)

    assert.equal(identity.openId, 'openid-test')
    assert.match(requestedUrl, /api\.weixin\.qq\.com\/sns\/jscode2session/)
    assert.match(requestedUrl, /js_code=login-code/)
    assert.match(requestedUrl, /appid=wx-test-app/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('exchangeWechatPhoneCode uses stable token then official phone endpoint', async () => {
  const originalFetch = globalThis.fetch
  const calls: Array<{ url: string; method: string; body: string }> = []

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input)
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : '',
    })

    if (url.includes('/cgi-bin/stable_token')) {
      return new Response(
        JSON.stringify({
          access_token: 'stable-token-test',
          expires_in: 7200,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    if (url.includes('/wxa/business/getuserphonenumber')) {
      return new Response(
        JSON.stringify({
          errcode: 0,
          errmsg: 'ok',
          phone_info: {
            phoneNumber: '+8613800138000',
            purePhoneNumber: '13800138000',
            countryCode: '86',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    throw new Error(`unexpected request: ${url}`)
  }) as typeof fetch

  try {
    const phone = await exchangeWechatPhoneCode('phone-code', env)

    assert.equal(phone.phoneNumber, '+8613800138000')
    assert.equal(phone.countryCode, '86')
    assert.equal(calls.length, 2)
    assert.match(calls[0].url, /api\.weixin\.qq\.com\/cgi-bin\/stable_token/)
    assert.equal(calls[0].method, 'POST')
    assert.match(calls[0].body, /"appid":"wx-test-app"/)
    assert.match(
      calls[1].url,
      /api\.weixin\.qq\.com\/wxa\/business\/getuserphonenumber/,
    )
    assert.match(calls[1].url, /access_token=stable-token-test/)
    assert.equal(calls[1].method, 'POST')
    assert.equal(JSON.parse(calls[1].body).code, 'phone-code')
  } finally {
    globalThis.fetch = originalFetch
  }
})
