// Observe attachments for an explicitly requested Waves image operation.
// Never change model capabilities, message content, or the decision returned by
// the host. Text-only model admission remains the host's responsibility; users
// can use /ww with attachments without sending images through a text model.
const pending = new Map()
const MAX_SESSIONS = 64
const MAX_IMAGES = 16

export function takeImages(agentId) {
  const refs = pending.get(agentId) ?? []
  pending.delete(agentId)
  return refs
}

export function registerImageBridge(ctx) {
  ctx.inject(['agents'], (actx) => {
    actx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      const agentId = payload.agent.id
      pending.delete(agentId)
      if (decision.kind === 'reject' || payload.signal?.aborted) return decision
      const refs = []
      for (const message of decision.messages || []) {
        if (message?.role !== 'user') continue
        if (message.source?.kind && message.source.kind !== 'user') continue
        for (const block of message.content || []) {
          if (block?.type === 'image' && block.attachment && refs.length < MAX_IMAGES) {
            refs.push(block.attachment)
          }
        }
      }
      if (refs.length) {
        if (pending.size >= MAX_SESSIONS) pending.delete(pending.keys().next().value)
        pending.set(agentId, refs)
      }
      return decision
    }, { prepend: true })
    actx.on('agent/disposed', (payload) => pending.delete(payload?.agent?.id))
    actx.effect(() => () => pending.clear())
  })
}
