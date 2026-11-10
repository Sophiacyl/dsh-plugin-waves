// 命令结果暂存与文本化
import fs from 'node:fs'
import path from 'node:path'

import { PROXY_PREFIX, RESULT_KEEP } from './consts.js'
import { plainSummary } from './native-result.js'

// 结果落盘: 重启后历史卡片还能还原成图文, 不至于退化成一段裸链接
export function makeResultStore(serviceDir) {
  const file = serviceDir ? path.join(serviceDir, 'data', 'command_results.json') : ''
  const items = new Map()
  let timer = null

  if (file && fs.existsSync(file)) {
    try {
      for (const [id, value] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) {
        items.set(id, value)
      }
    } catch {
      // 存档坏了就当没有, 下次写入会覆盖
    }
  }

  const flush = () => {
    timer = null
    if (!file) return
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(Object.fromEntries(items)))
    } catch {
      // 落盘失败不影响本次会话
    }
  }

  return {
    put(id, value) {
      // Updating a session's native result must also advance recency.
      items.delete(String(id))
      items.set(String(id), value)
      while (items.size > RESULT_KEEP) items.delete(items.keys().next().value)
      if (file && !timer) timer = setTimeout(flush, 400)
    },
    get(id) {
      return items.get(String(id))
    },
    latest(sessionId) {
      return [...items.values()].reverse().find((value) => value.sessionId === sessionId)
    },
  }
}

export function collectLinks(segments, out = []) {
  for (const seg of segments || []) {
    if (!seg) continue
    if (seg.type === 'node') collectLinks(seg.items, out)
    else if (seg.type === 'image' || seg.type === 'html' || seg.type === 'file') {
      const url = String(seg.url || '')
      if (url) out.push(url.startsWith('/api/') ? PROXY_PREFIX + url : url)
    }
  }
  return out
}

// Native clients do not run the Web command renderer. Always retain the digest.
export function resultText(command, data) {
  return `${command} · ${plainSummary(data).slice(0, 6000)}`
}
