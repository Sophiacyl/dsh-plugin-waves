import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { resultMeta } from '../lib/host/native-result.js'

const filename = '0123456789abcdef0123.native.jpg'
// Minimal JPEG marker fixture for header parsing; not an image decoder fixture.
function header(width = 320, height = 640) {
  const data = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
    0x00, 0x00, 0x00, 0x00, 0x03, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 0xff, 0xd9])
  data.writeUInt16BE(height, 7)
  data.writeUInt16BE(width, 9)
  return data
}
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'waves-media-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const media = join(dir, 'data', 'media')
  await mkdir(media, { recursive: true })
  return { dir, media }
}
const value = { ok: true, summary: '测试摘要', segments: [{ type: 'html', native_image: filename }] }

test('chat results use file-backed media metadata, never panel asset image views', async (t) => {
  const { dir, media } = await fixture(t)
  await writeFile(join(media, filename), header())
  const meta = resultMeta({ command: 'ww练度' }, value, dir)
  const result = meta['dsh-go/media']
  assert.equal(result.v, 1)
  assert.equal(result.kind, 'image')
  assert.equal(result.status, 'done')
  assert.deepEqual(result.items, [{ path: join(media, filename), mime: 'image/jpeg', width: 320, height: 640, bytes: header().length }])
  assert.equal(result.request.label, '鸣潮')
  assert.equal(result.request.n, 1)
  assert.equal(meta['dsh-go/view'], undefined)
  assert.deepEqual(meta.segments, value.segments)
})

test('expired or invalid image files degrade to readable text without a broken image', async (t) => {
  const { dir, media } = await fixture(t)
  for (const data of [null, Buffer.from('not jpeg'), Buffer.alloc(1048577)]) {
    if (data) await writeFile(join(media, filename), data)
    const meta = resultMeta({}, value, dir)
    assert.equal(meta['dsh-go/media'], undefined)
    assert.deepEqual(meta['dsh-go/view'].children, [{ type: 'text', text: '测试摘要' }])
  }
})

test('chat image metadata cannot reference traversal paths or symlinks outside media directory', async (t) => {
  const { dir, media } = await fixture(t)
  const outside = join(dir, 'outside.jpg')
  await writeFile(outside, header())
  await symlink(outside, join(media, filename))
  assert.equal(resultMeta({}, value, dir)['dsh-go/media'], undefined)
  const traversed = { ...value, segments: [{ type: 'image', native_image: '../../outside.jpg' }] }
  assert.equal(resultMeta({}, traversed, dir)['dsh-go/media'], undefined)
})

test('nested image results retain their file dimensions in the chat card', async (t) => {
  const { dir, media } = await fixture(t)
  await writeFile(join(media, filename), header(876, 4096))
  const nested = { ...value, segments: [{ type: 'node', items: value.segments }] }
  const item = resultMeta({}, nested, dir)['dsh-go/media'].items[0]
  assert.equal(item.width, 876)
  assert.equal(item.height, 4096)
})
