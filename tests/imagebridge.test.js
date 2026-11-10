import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerImageBridge, takeImages } from '../lib/host/imagebridge.js'

function fixture() {
  const listeners = new Map()
  const disposers = []
  const injected = []
  const resolveModelInfo = async () => ({ inputModalities: ['text'] })
  const ctx = {
    llm: { resolveModelInfo },
    inject(deps, callback) { injected.push(...deps); callback(ctx) },
    on(event, fn) { listeners.set(event, fn) },
    effect(fn) { disposers.push(fn()) },
  }
  registerImageBridge(ctx)
  return { ctx, listeners, disposers, injected, resolveModelInfo }
}

const ref = Object.freeze({ attachmentId: 'test-image' })
const image = Object.freeze({ type: 'image', attachment: ref })
const message = Object.freeze({ role: 'user', source: { kind: 'user' }, content: Object.freeze([image, Object.freeze({ type: 'text', text: '普通聊天截图' })]) })

test('image observer preserves host decision and exact user image content', async () => {
  const { ctx, listeners, injected, resolveModelInfo } = fixture()
  const decision = Object.freeze({ kind: 'enter', messages: Object.freeze([message]) })
  const value = await listeners.get('agent/pre-step')({ agent: { id: 'preserve' } }, async () => decision)
  assert.equal(value, decision)
  assert.equal(value.messages[0], message)
  assert.equal(value.messages[0].content[0], image)
  assert.equal(value.messages[0].content.length, 2)
  assert.equal(ctx.llm.resolveModelInfo, resolveModelInfo)
  assert.deepEqual(injected, ['agents'])
  assert.deepEqual(takeImages('preserve'), [ref])
  assert.deepEqual(takeImages('preserve'), [])
})

test('images are isolated by session and removed for a later text-only step', async () => {
  const { listeners } = fixture()
  const step = listeners.get('agent/pre-step')
  await step({ agent: { id: 'a' } }, async () => ({ kind: 'enter', messages: [message] }))
  assert.deepEqual(takeImages('b'), [])
  await step({ agent: { id: 'a' } }, async () => ({ kind: 'enter', messages: [{ role: 'user', content: [{ type: 'text', text: '下一条' }] }] }))
  assert.deepEqual(takeImages('a'), [])
})

test('rejected steps and disposal clear pending images without altering host results', async () => {
  const { listeners, disposers } = fixture()
  const step = listeners.get('agent/pre-step')
  await step({ agent: { id: 'reject' } }, async () => ({ kind: 'enter', messages: [message] }))
  const rejected = { kind: 'reject' }
  assert.equal(await step({ agent: { id: 'reject' } }, async () => rejected), rejected)
  assert.deepEqual(takeImages('reject'), [])
  await step({ agent: { id: 'dispose' } }, async () => ({ kind: 'enter', messages: [message] }))
  listeners.get('agent/disposed')({ agent: { id: 'dispose' } })
  assert.deepEqual(takeImages('dispose'), [])
  for (const dispose of disposers) dispose()
})
