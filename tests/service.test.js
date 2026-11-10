import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { bootstrap, waitReady } from '../lib/host/service.js'

async function fixture(t, script) {
  const root = await mkdtemp(join(tmpdir(), 'waves-setup-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const service = join(root, 'service')
  await mkdir(service)
  await writeFile(join(root, 'install.sh'), script)
  return service
}

test('bootstrap stays asynchronous and returns installation failure', { skip: process.platform === 'win32' }, async (t) => {
  const service = await fixture(t, '#!/bin/sh\nsleep 0.1\nexit 7\n')
  let ticked = false
  setImmediate(() => { ticked = true })
  const result = await bootstrap(service, { timeoutMs: 2000 })
  assert.equal(ticked, true)
  assert.equal(result.ok, false)
  assert.match(result.reason, /7/)
})

test('bootstrap is bounded and can be canceled', { skip: process.platform === 'win32' }, async (t) => {
  const service = await fixture(t, '#!/bin/sh\nsleep 30\n')
  const timed = await bootstrap(service, { timeoutMs: 30 })
  assert.equal(timed.ok, false)
  assert.match(timed.reason, /超时/)
  const controller = new AbortController()
  controller.abort()
  assert.deepEqual(await bootstrap(service, { signal: controller.signal }), { ok: false, reason: '已取消安装' })
})

test('bootstrap reports success only for a successful installer', { skip: process.platform === 'win32' }, async (t) => {
  const service = await fixture(t, '#!/bin/sh\nexit 0\n')
  assert.equal((await bootstrap(service, { timeoutMs: 2000 })).ok, true)
})

test('waitReady requires affirmative health and honors cancellation', async () => {
  assert.equal(await waitReady({ call: async () => ({ ok: false }) }, 0), false)
  assert.equal(await waitReady({ call: async () => ({ ok: true }) }, 1), true)
  const controller = new AbortController()
  controller.abort()
  assert.equal(await waitReady({ call: () => { throw Error('must not call') } }, 1, controller.signal), false)
})
