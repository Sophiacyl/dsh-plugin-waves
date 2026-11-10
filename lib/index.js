import { registerAliasHint } from './host/aliashint.js'
import { readAttachments } from './host/attachments.js'
import { runSlashCommand } from './host/command.js'
import { registerImageBridge } from './host/imagebridge.js'
import { registerProxy } from './host/proxy.js'
import { makeResultStore } from './host/results.js'
import {
  bootstrap,
  exposeToModelFlag,
  makeClient,
  readPrefixes,
  resolveServiceDir,
  startService,
  waitReady,
} from './host/service.js'
import { registerTool } from './host/tool.js'
import { registerWorldbook } from './host/worldbook.js'
import { registerNative } from './host/native.js'

export const name = 'waves-plugin'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const port = config.port ?? 9777
  const serviceDir = resolveServiceDir(config)
  const client = makeClient(port)
  const results = makeResultStore(serviceDir)

  if (config.autoStart !== false && process.env.WAVES_AUTOSTART !== '0') {
    ctx.effect(() => {
      const controller = new AbortController()
      let stop
      bootstrap(serviceDir, { signal: controller.signal }).then(async (boot) => {
        if (controller.signal.aborted) return
        if (!boot.ok) {
          console.log(`[waves] 自动安装未完成，服务未启动: ${boot.reason}`)
          return
        }
        stop = startService(ctx, { port, serviceDir })
        const ok = await waitReady(client, 60, controller.signal)
        if (!ok && !controller.signal.aborted) console.log('[waves] 服务未能在 60s 内就绪')
      }).catch((error) => console.log(`[waves] 环境准备失败: ${String(error.message || error)}`))
      return () => { controller.abort(); stop?.() }
    })
  }

  registerProxy(ctx, client, results)
  registerNative(ctx, client, results)

  // commands 只在带交互界面的 profile 里存在, 软依赖
  ctx.inject(['commands'], (cctx) => {
    for (const prefix of readPrefixes(serviceDir)) {
      cctx.commands.register({
        name: prefix,
        description: '直接执行鸣潮命令，不经过模型',
        input: { hint: '<命令> 如 查询 / 深塔 / 椿面板', attachments: true },
        handler: (invocation) => runSlashCommand(client, results, invocation,
          async (blocks, signal) => ({ ...(await readAttachments(cctx, blocks, signal)),
            ...(cctx.get('dshGo') ? { native: true } : {}) })),
      })
    }
  })

  // 零上下文: 不把工具暴露给模型, 只保留 / 命令触发, 省下这段描述占用的上下文
  if (config.exposeToModel === false || !exposeToModelFlag(serviceDir)) {
    console.log('[waves] 零上下文模式: 模型不可见, 请用 /ww 命令')
    return
  }

  registerTool(ctx, client, serviceDir, results)
  registerAliasHint(ctx, client)
  registerImageBridge(ctx)
  registerWorldbook(ctx, client)
}
