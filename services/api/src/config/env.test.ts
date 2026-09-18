import assert from 'node:assert/strict'
import test from 'node:test'
import { loadEnv } from './env.js'

test('blank optional env values are treated as unset', () => {
  const env = loadEnv({
    NODE_ENV: 'development',
    DATABASE_URL: 'mysql://user:pass@localhost:3306/test',
    WECHAT_APP_ID: '',
    WECHAT_APP_SECRET: '',
  })

  assert.equal(env.DATABASE_URL, 'mysql://user:pass@localhost:3306/test')
  assert.equal(env.WECHAT_APP_ID, undefined)
  assert.equal(env.WECHAT_APP_SECRET, undefined)
})
