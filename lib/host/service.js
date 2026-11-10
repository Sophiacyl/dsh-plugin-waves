// 服务进程托管: 目录解析、首启安装、拉起与健康检查
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PKG_NAME } from './consts.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

export function serviceDirCandidates() {
  const home = process.env.DSH_HOME || join(process.env.HOME || process.env.USERPROFILE || '', '.dsh')
  const profiles = join(home, 'profiles')
  const out = []
  let names = []
  try {
    names = readdirSync(profiles)
  } catch {
    return out
  }
  for (const name of names) {
    // 用 file: 装的按源码目录跑(环境和数据都在克隆里, README 的用法), 找不到才用 profile 里的副本
    try {
      const manifest = JSON.parse(readFileSync(join(profiles, name, 'package.json'), 'utf8'))
      const spec = manifest?.dependencies?.[PKG_NAME]
      if (typeof spec === 'string' && spec.startsWith('file:')) {
        out.push(join(spec.slice('file:'.length), 'service'))
      }
    } catch {}
    out.push(join(profiles, name, 'node_modules', PKG_NAME, 'service'))
  }
  return out
}

export function resolveServiceDir(config) {
  const candidates = [
    config?.servicePath,
    process.env.WAVES_SERVICE_DIR,
    ...serviceDirCandidates(),
    join(ROOT, 'service'),
  ].filter((dir) => dir && existsSync(join(dir, 'rover/main.py')))
  // 已经装好的(有虚拟环境或数据)优先: 免得把跑着的实例切到一个空目录去重装
  const ready = candidates.find(
    (dir) => existsSync(venvPython(dir)) || existsSync(join(dir, 'data/config.json')),
  )
  return ready || candidates[0] || join(ROOT, 'service')
}

// 服务配置里的模型可见开关; 读文件即可, 改动本来就要重启生效
export function exposeToModelFlag(serviceDir) {
  try {
    const cfg = JSON.parse(readFileSync(join(serviceDir, 'data/config.json'), 'utf8'))
    return cfg.expose_to_model !== false
  } catch {
    return true
  }
}

// 命令前缀(逗号分隔多个); 每个前缀都注册成命令, 菜单里才都列得出来
export function readPrefixes(serviceDir) {
  try {
    const cfg = JSON.parse(readFileSync(join(serviceDir, 'data/config.json'), 'utf8'))
    const raw = String(cfg.command_prefix ?? 'ww')
    const list = raw.split(/[,，]/).map((x) => x.trim()).filter(Boolean)
    return list.length ? list : ['ww']
  } catch {
    return ['ww']
  }
}

// 虚拟环境的解释器位置随平台不同: Windows 在 Scripts\\python.exe
export function venvPython(serviceDir) {
  return join(
    serviceDir,
    '.venv',
    process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python',
  )
}

export function servicePython(serviceDir) {
  const venv = venvPython(serviceDir)
  if (existsSync(venv)) return venv
  return process.platform === 'win32' ? 'python' : 'python3'
}

export function makeClient(port) {
  const base = `http://127.0.0.1:${port}`
  async function call(path, { method = 'GET', body, signal, timeoutMs = 300000 } = {}) {
    const controller = new AbortController()
    if (signal?.aborted) controller.abort()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onAbort = () => controller.abort()
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await fetch(base + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })
      const text = await res.text()
      let data
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        throw new Error(`服务返回非 JSON (${res.status}): ${text.slice(0, 200)}`)
      }
      if (!res.ok) throw new Error(data?.detail || data?.error || `服务错误 ${res.status}`)
      return data
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  }
  return { base, call }
}

// Bounded asynchronous setup: never block the host event loop during downloads.
function setupCommand(command, args, { cwd, signal, timeoutMs, stdio = 'ignore' }) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ ok: false, reason: '已取消安装' })
    let child
    let reason
    let settled = false
    let timer
    const finish = (value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve(value)
    }
    const cancel = (message) => {
      reason = message
      try {
        if (process.platform !== 'win32' && child?.pid) process.kill(-child.pid, 'SIGTERM')
        else child?.kill('SIGTERM')
      } catch {}
      finish({ ok: false, reason })
    }
    const abort = () => cancel('已取消安装')
    try {
      child = spawn(command, args, { cwd, stdio, detached: process.platform !== 'win32' })
    } catch (error) {
      finish({ ok: false, reason: String(error.message || error) })
      return
    }
    child.once('error', (error) => finish({ ok: false, reason: reason || String(error.message || error) }))
    child.once('close', (code) => finish({ ok: code === 0, reason: code === 0 ? undefined : reason || `退出码 ${code}` }))
    signal?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => cancel('安装超时，请检查网络后重试'), timeoutMs)
  })
}

export async function bootstrap(serviceDir, { signal, timeoutMs = 15 * 60_000 } = {}) {
  const root = join(serviceDir, '..')
  // An existing interpreter alone does not prove installation completed.
  const pluginsReady = ['XutheringWavesUID', 'RoverSign', 'ScoreEcho'].every((name) =>
    existsSync(join(serviceDir, 'plugins', name, name, '__init__.py')))
  if (existsSync(venvPython(serviceDir)) && pluginsReady) {
    const checked = await setupCommand(venvPython(serviceDir), ['-c',
      'import cv2, cryptography, fastapi, sqlmodel, PIL, jinja2, lxml, msgspec, rapidocr, onnxruntime, playwright'],
    { cwd: serviceDir, signal, timeoutMs: 30_000 })
    if (checked.ok) return checked
    if (signal?.aborted) return checked
  }
  const windows = process.platform === 'win32'
  const script = join(root, windows ? 'install.ps1' : 'install.sh')
  if (!existsSync(script)) return { ok: false, reason: `缺少 ${windows ? 'install.ps1' : 'install.sh'}` }
  console.log('[waves] 正在准备运行环境，可继续使用其它会话...')
  return setupCommand(windows ? 'powershell' : 'bash', windows
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-EnvOnly']
    : [script, '--env-only'], { cwd: root, signal, timeoutMs, stdio: 'inherit' })
}

// 与 rover.restart.RESTART_EXIT 一致: 资源有 diff 后主动退出, 马上再拉起
const RESTART_EXIT = 75

// 去掉 no_proxy 里带方括号的 IPv6 项
export function serviceEnv(port, base = process.env) {
  const env = { ...base, PYTHONUNBUFFERED: '1', ROVER_PORT: String(port) }
  for (const key of ['no_proxy', 'NO_PROXY']) {
    if (typeof env[key] !== 'string') continue
    env[key] = env[key]
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item && !item.startsWith('['))
      .join(',')
  }
  return env
}

export function startService(ctx, config) {
  const python = servicePython(config.serviceDir)
  let child
  let stopping = false
  let timer
  let backoff = 500
  let failures = 0

  const log = (buf, level) => {
    const line = buf.toString().trimEnd()
    if (line) ctx.logger?.[level]?.(line) ?? console.log(`[waves] ${line}`)
  }

  const launch = () => {
    if (stopping) return
    child = spawn(python, ['-m', 'rover.main', '--port', String(config.port)], {
      cwd: config.serviceDir,
      env: serviceEnv(config.port),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const launchedAt = Date.now()
    child.stdout.on('data', (b) => log(b, 'info'))
    child.stderr.on('data', (b) => log(b, 'warn'))
    child.once('error', (error) => console.log(`[waves] 无法启动服务: ${String(error.message || error)}`))
    child.once('close', (code) => {
      child = undefined
      if (stopping) return
      const asked = code === RESTART_EXIT
      if (asked || Date.now() - launchedAt > 60_000) failures = 0
      if (!asked && ++failures >= 5) {
        console.log('[waves] 服务连续失败 5 次，已停止自动重试；请修复环境后重新加载插件')
        return
      }
      const wait = asked ? 400 : backoff
      if (asked) backoff = 500
      else backoff = Math.min(backoff * 2, 10000)
      console.log(`[waves] 服务退出 code=${code}${asked ? ' (主动重启)' : ''}, ${wait}ms 后拉起`)
      timer = setTimeout(launch, wait)
    })
  }

  launch()
  const stop = () => {
    stopping = true
    if (timer) clearTimeout(timer)
    try {
      child?.kill('SIGTERM')
    } catch {}
  }
  // dsh 进程退出时连带结束服务, 避免残留
  process.on('exit', stop)
  return () => {
    process.removeListener('exit', stop)
    stop()
  }
}

export async function waitReady(client, tries = 60, signal) {
  for (let i = 0; i < tries && !signal?.aborted; i++) {
    try {
      const health = await client.call('/api/health', { timeoutMs: 2000, signal })
      if (health?.ok === true) return true
    } catch {
      if (signal?.aborted) return false
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

