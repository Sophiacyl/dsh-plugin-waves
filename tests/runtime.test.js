// Opt-in checks against a real DSH installation, without enabling the plugin.
// DSH_TEST_RUNTIME=/opt/dsh npm test
import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

const runtime = process.env.DSH_TEST_RUNTIME

test('installed DSH accepts version ranges and executes both Waves tool definitions', {
  skip: runtime ? false : 'Set DSH_TEST_RUNTIME to the DSH installation directory',
}, async () => {
  const require = createRequire(pathToFileURL(resolve(runtime, 'package.json')))
  const semver = require('semver')
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(semver.satisfies(process.versions.node, manifest.engines.node))
  for (const [name, range] of Object.entries(manifest.peerDependencies)) {
    const installed = require(`${name}/package.json`)
    assert.ok(semver.satisfies(installed.version, range), `${name}@${installed.version} is outside ${range}`)
    if (name === '@deepseek-ai/dsh-tools') {
      assert.ok(semver.satisfies(installed.version, manifest.engines.dsh))
    }
  }

  // Resolve peer imports from the selected installation only for plugin modules.
  // No symlinks, dependency installation, profile changes or service startup.
  const pluginRoot = new URL('../lib/', import.meta.url).href
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith('@deepseek-ai/') && context.parentURL?.startsWith(pluginRoot)) {
        return nextResolve(pathToFileURL(require.resolve(specifier)).href, context)
      }
      return nextResolve(specifier, context)
    },
  })
  try {
    const { registerTool } = await import('../lib/host/tool.js')
    const { apply } = await import('../lib/index.js')
    assert.equal(typeof apply, 'function')
    const tools = []
    const calls = []
    const client = { async call(path, options) {
      calls.push({ path, options })
      return path === '/api/health' ? { ok: true } : {
        ok: true, summary: '查询结果', segments: [{ type: 'text', text: '体力 120/240' }],
      }
    } }
    registerTool({ tools: { register: (tool) => tools.push(tool) } }, client, resolve(runtime, 'waves-test-service-not-created'))
    assert.deepEqual(tools.map((tool) => tool.name), ['waves', 'waves_panel'])
    const signal = new AbortController().signal
    for (const [index, args] of [{ command: 'ww体力' }, { char: '椿' }].entries()) {
      const tool = tools[index]
      const value = await tool.execute(args, { agent: { id: 'compat-session' }, signal })
      assert.equal(value.ok, true)
      assert.deepEqual(tool.output.render(args, value), [{ type: 'text', text: '查询结果' }])
      assert.deepEqual(tool.output.presentationMeta(args, value).segments, value.segments)
      assert.equal(tool.presentCall(args).card, 'generic')
    }
    assert.deepEqual(calls.map(({ path }) => path), ['/api/health', '/api/chat', '/api/health', '/api/render/panel'])
    assert.equal(calls[1].options.body.session_id, 'compat-session')
    assert.equal(calls[3].options.body.char, '椿')
    await assert.rejects(tools[0].execute({}, { signal }))
    await assert.rejects(tools[1].execute({ char: 123 }, { signal }))
  } finally {
    hooks.deregister()
  }
})
