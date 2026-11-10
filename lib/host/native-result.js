// Panel assets need a plugin owner; chat uses file-backed dsh-go/media.
import { readFileSync, statSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { createHash } from 'node:crypto'

const ASSETS = 'asset:'
const FILE = /^[a-f0-9]{20}\.native\.jpg$/

export function plainSummary(value) {
  return String(value?.summary || (value?.ok ? '已执行' : '执行失败'))
    .replace(/\[(?:图片|图文卡片)已在(?:卡片|界面)中展示\]\s*/g, '')
    .trim() || '已执行，暂无文字摘要'
}

export function nativeResultView(value) {
  const children = []
  let count = 0
  const walk = (segments, depth = 0) => {
    if (depth > 5) return
    for (const seg of (Array.isArray(segments) ? segments : []).slice(0, 40)) {
      if (count >= 8) break
      if (seg?.type === 'node') walk(seg.items, depth + 1)
      else if (FILE.test(String(seg?.native_image || ''))) {
        children.push({ type: 'image', src: ASSETS + seg.native_image, alt: '鸣潮图文结果' })
        count++
      }
    }
  }
  walk(value?.segments)
  const summary = plainSummary(value).slice(0, 1400)
  children.push({ type: 'text', text: summary })
  if (children.length === 1 && (value?.segments || []).some((s) => s.type === 'html' || s.type === 'image')) {
    children.push({ type: 'callout', tone: 'info', text: '图片暂不可用，已保留文字摘要。' })
  }
  const view = { type: 'stack', title: '鸣潮', children }
  return Buffer.byteLength(JSON.stringify(view)) <= 8000 ? view : {
    type: 'stack', title: '鸣潮', children: [{ type: 'text', text: summary.slice(0, 800) }],
  }
}

function jpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) return undefined
    const marker = bytes[offset + 1]
    const length = bytes.readUInt16BE(offset + 2)
    if (length < 2 || offset + length + 2 > bytes.length) return undefined
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return {
      width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5),
    }
    offset += length + 2
  }
}

export function resultMeta(args, value, serviceDir) {
  const base = { segments: value?.segments ?? [], matched: value?.matched ?? [] }
  const items = []
  if (serviceDir) {
    try {
      const root = realpathSync(join(serviceDir, 'data', 'media'))
      const walk = (segments, depth = 0) => {
        if (depth > 5) return
        for (const segment of (Array.isArray(segments) ? segments : []).slice(0, 40)) {
          if (items.length >= 8) break
          if (segment?.type === 'node') walk(segment.items, depth + 1)
          else if (FILE.test(String(segment?.native_image || ''))) {
            try {
              const path = realpathSync(join(root, segment.native_image))
              if (!path.startsWith(root + sep)) continue
              const stat = statSync(path)
              if (!stat.isFile() || stat.size > 1048576) continue
              const size = jpegSize(readFileSync(path))
              if (size) items.push({ path, mime: 'image/jpeg', ...size, bytes: stat.size })
            } catch { /* Missing/expired images fall back to the summary. */ }
          }
        }
      }
      walk(value?.segments)
    } catch { /* Service media directory not initialized yet. */ }
  }
  if (items.length) return { ...base, 'dsh-go/media': {
    v: 1,
    rid: 'waves_' + createHash('sha256').update(items.map((item) => item.path).join('|')).digest('hex').slice(0, 24),
    kind: 'image', status: 'done', items,
    request: { provider: 'waves', model: 'local-render', label: '鸣潮', n: items.length },
    prompt: String(args?.command || (args?.char ? args.char + '面板' : '鸣潮查询')).slice(0, 200),
  } }
  return { ...base, 'dsh-go/view': { type: 'stack', title: '鸣潮', children: [
    { type: 'text', text: plainSummary(value).slice(0, 1400) },
  ] } }
}
