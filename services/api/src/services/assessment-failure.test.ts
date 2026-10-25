import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { classifyAssessmentFailure } from './assessment-failure.js'
import {
  JsonModelProviderHttpError, JsonModelProviderInvalidJsonError,
  JsonModelProviderTimeoutError, JsonModelProviderTruncatedError,
} from './ai-provider.js'

test('provider failures use typed status and cause codes without inspecting messages', () => {
  const cases: Array<[unknown, string, boolean]> = [
    [new JsonModelProviderHttpError(401), 'authentication', true],
    [new JsonModelProviderHttpError(404, 'model_not_found'), 'model_unavailable', true],
    [new JsonModelProviderHttpError(429), 'quota_limited', true],
    [new JsonModelProviderTimeoutError(), 'timeout', false],
    [new JsonModelProviderTruncatedError(), 'truncated', true],
    [new JsonModelProviderInvalidJsonError('private output'), 'invalid_json', true],
    [z.object({ ok: z.boolean() }).safeParse({ ok: 1 }).error!, 'invalid_schema', true],
    [Object.assign(new Error('private message'), { cause: { code: 'ENOTFOUND' } }), 'connection', false],
    [Object.assign(new Error('node lookup failure'), { code: 'ERR_INVALID_IP_ADDRESS' }), 'connection', false],
    [new Error('authentication'), 'internal', false],
  ]
  for (const [error, category, reachable] of cases) {
    assert.deepEqual({ category: classifyAssessmentFailure(error).category,
      reachable: classifyAssessmentFailure(error).reachable }, { category, reachable })
  }
})
