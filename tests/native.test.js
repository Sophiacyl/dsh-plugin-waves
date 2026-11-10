import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { registerNative } from '../lib/host/native.js'
import { nativeResultView, plainSummary } from '../lib/host/native-result.js'
import { makeResultStore, resultText } from '../lib/host/results.js'

const kit = process.env.DSH_GO_KIT
const scope = { sessionId: 'native-test-session' }
const caps = { components: ['form', 'gallery'] }
const groups = [{ name: '服务配置', items: [
  { key: 'image_ocr', title: 'OCR', desc: '图片摘要', type: 'BoolConfig', value: true },
  { key: 'WavesToken', title: 'Token', desc: '从文件导入', type: 'StrConfig', value: '已设置', secret: true, is_set: true },
  { key: 'integer', title: '整数', desc: '', type: 'IntConfig', value: 1 },
] }]

function fixture() {
  const panels = new Map()
  const calls = []
  const ctx = { dshGo: { panel: (id, def) => panels.set(id, def) }, inject: (_deps, callback) => callback(ctx) }
  const client = { async call(path, opts = {}) {
    calls.push({ path, ...opts })
    if (path === '/api/config' && !opts.method) return { groups }
    if (path === '/api/config') return { ok: true }
    return { ok: true, summary: '体力 120/240', segments: [] }
  } }
  const results = makeResultStore()
  registerNative(ctx, client, results)
  return { panels, calls, results, ctx }
}

test('native tool cards use safe local images and preserve useful fallback text', () => {
  const data = { ok: true, summary: '[图文卡片已在界面中展示]\n卡片内容: 体力120/240', segments: [
    { type: 'html', native_image: '1234567890abcdef1234.native.jpg' },
    { type: 'image', native_image: '../config.json' },
  ] }
  const view = nativeResultView(data)
  assert.equal(view.children.filter((c) => c.type === 'image').length, 1)
  assert.equal(view.children[0].src, 'asset:1234567890abcdef1234.native.jpg')
  assert.match(resultText('查询', data), /120\/240/)
  assert.doesNotMatch(plainSummary(data), /已在界面/)
  assert.ok(Buffer.byteLength(JSON.stringify(nativeResultView({ summary: '长'.repeat(10000) }))) <= 8000)
})

test('native query action uses deferred results and keeps the result scoped to its session', async () => {
  const { panels, calls, results } = fixture()
  const query = panels.get('waves-home').actions.query(scope, { value: { values: { 'data.form.command': 'ww体力' } } })
  assert.equal(query.pending.timeoutMs, 60000)
  const result = await query.result(new AbortController().signal)
  assert.match(result.patch.summary, /120\/240/)
  assert.equal(calls[0].body.native, true)
  assert.equal(calls[0].body.session_id, scope.sessionId)
  assert.equal(results.latest(scope.sessionId).command, 'ww体力')
  assert.equal(results.latest('another-session'), undefined)
})

test('settings validates identifiers and values and never renders a secret input', async () => {
  const { panels, calls } = fixture()
  const settings = panels.get('waves-settings')
  const edit = panels.get('waves-edit')
  await settings.actions.edit(scope, { value: { group: '服务配置', key: 'WavesToken' } })
  const view = await edit.view(scope, caps)
  assert.doesNotMatch(JSON.stringify(view), /textField|data.form.value/)
  const secretSave = await edit.actions.save(scope, { value: { values: { 'data.form.value': 'must-not-save' } } }).result(new AbortController().signal)
  assert.match(secretSave.toast, /文件导入/)
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0)
  assert.ok((await settings.actions.edit(scope, { value: { group: '__proto__', key: 'bad' } })).toast)
  await settings.actions.edit(scope, { value: { group: '服务配置', key: 'integer' } })
  const rejected = await edit.actions.save(scope, { value: { values: { 'data.form.value': 1.5 } } }).result(new AbortController().signal)
  assert.match(rejected.toast, /有效数字/)
})

test('opening a second setting resets the cached editor feed before navigation', async () => {
  const { panels } = fixture()
  const editorFeed = { form: { value: 'stale-value' }, notice: 'stale-notice' }
  const effects = await panels.get('waves-settings').actions.edit(scope, { value: { group: '服务配置', key: 'integer' } })
  assert.equal(effects[0].type, 'patch')
  assert.equal(effects[0].id, 'waves-edit')
  Object.assign(editorFeed, effects[0].data)
  assert.equal(editorFeed.form.value, 1)
  assert.equal(editorFeed.notice, '')
  assert.equal(effects[1].open, 'panel:waves-edit')
  const secretEffects = await panels.get('waves-settings').actions.edit(scope, { value: { group: '服务配置', key: 'WavesToken' } })
  assert.equal(secretEffects[0].data.form.value, '')
})

test('credential files are consumed only during import and never returned in effects', async () => {
  const { panels, calls, ctx } = fixture()
  const marker = 'dummy-test-value-not-a-real-token'
  ctx.dshGo.readPickedFile = (handle) => { assert.equal(handle, 'test-file'); return Buffer.from(marker) }
  await panels.get('waves-settings').actions.edit(scope, { value: { group: '服务配置', key: 'WavesToken' } })
  const result = await panels.get('waves-edit').actions['import-file'](scope, { value: { status: 'selected', files: [{ handle: 'test-file' }] } })
  const saved = calls.find((call) => call.method === 'POST')
  assert.equal(saved.body.value, marker)
  assert.doesNotMatch(JSON.stringify(result), new RegExp(marker))
  assert.equal(result.patch.form.value, '')
})

test('latest result follows replacement recency across native and slash commands', () => {
  const store = makeResultStore()
  store.put('native:s', { sessionId: 's', summary: 'first' })
  store.put('slash', { sessionId: 's', summary: 'second' })
  store.put('native:s', { sessionId: 's', summary: 'third' })
  assert.equal(store.latest('s').summary, 'third')
})

test('native views and tool card pass the installed App protocol checker', { skip: !kit }, async () => {
  const { checkView } = await import(pathToFileURL(kit + '/lib/view-check.js').href)
  const { panels } = fixture()
  for (const [id, panel] of panels) {
    const view = await panel.view(scope, caps)
    const checked = checkView(view, { profile: 'panel', data: { summary: '测试', images: [], form: { command: '', value: true }, notice: '' } })
    assert.deepEqual(checked.issues.filter((issue) => issue.kind !== 'note'), [], `${id}: ${JSON.stringify(checked.issues)}`)
  }
  const image = { type: 'html', native_image: '1234567890abcdef1234.native.jpg' }
  const value = { ok: true, summary: '体力120/240', segments: [image] }
  const card = checkView(nativeResultView(value), { profile: 'toolCard' })
  assert.deepEqual(card.issues.filter((issue) => !(issue.kind === 'note' && issue.path === 'view.accent')), [])
  const { panels: imagePanels, results } = fixture()
  results.put('image-test', { ...value, sessionId: scope.sessionId })
  const home = imagePanels.get('waves-home')
  const patch = home.actions.latest(scope).patch
  assert.equal(patch.images[0].src, 'asset:' + image.native_image)
  const gallery = checkView(await home.view(scope, caps), { profile: 'panel', data: patch })
  assert.deepEqual(gallery.issues.filter((issue) => !(issue.kind === 'note' && issue.path === 'view.accent')), [])
})
