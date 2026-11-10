import { plainSummary } from './native-result.js'

const text = (value) => ({ type: 'text', text: String(value).slice(0, 1800) })
const action = (label, id, args) => ({ label, action: args ? { id, args } : id })
const canV2 = (caps) => caps?.components?.includes('form')
const keyOf = (scope) => scope.sessionId || 'global'
const editData = (item) => ({ form: { value: item.secret || item.upload && !item.upload.with_text ? '' :
  item.type === 'DictConfig' ? JSON.stringify(item.value) : item.type.includes('List') ? (item.value || []).join(',') : item.value }, notice: '' })
const pending = (label, work) => ({ pending: { label, timeoutMs: 60000 }, result: async (signal) => {
  try { return await work(signal) } catch { return { toast: '操作失败，请稍后重试' } }
} })

export function registerNative(ctx, client, results) {
  ctx.inject(['dshGo'], (nctx) => {
    // Keep only navigation identifiers, never secrets or user input. Bound memory.
    const states = new Map()
    const state = (scope) => {
      const key = keyOf(scope)
      if (!states.has(key)) {
        if (states.size >= 64) states.delete(states.keys().next().value)
        states.set(key, { group: 0, page: 0 })
      }
      return states.get(key)
    }
    const config = () => client.call('/api/config', { timeoutMs: 1800 })
    const selected = async (scope) => {
      const groups = (await config()).groups || []
      const s = state(scope)
      const group = groups.find((g) => g.name === s.editGroup)
      const item = group?.items?.find((i) => i.key === s.editKey)
      if (!item) throw Error('配置项不存在')
      return { group, item }
    }
    const latest = (scope) => results.latest(scope.sessionId)
    const resultPatch = (scope) => {
      const value = latest(scope)
      const images = []
      const collect = (segments, depth = 0) => {
        if (depth > 5) return
        for (const seg of (segments || []).slice(0, 40)) {
          if (seg?.type === 'node') collect(seg.items, depth + 1)
          else if (/^[a-f0-9]{20}\.native\.jpg$/.test(seg?.native_image || '') && images.length < 8) {
            images.push({ src: 'asset:' + seg.native_image, alt: '鸣潮结果' })
          }
        }
      }
      collect(value?.segments)
      return { summary: value ? plainSummary(value).slice(0, 1800) : '暂无查询结果。可输入命令，或发送 /ww 查询。', images, form: { command: '' } }
    }
    const run = (scope, command) => pending('正在查询鸣潮', async (signal) => {
      if (typeof command !== 'string' || !command.trim() || command.length > 500) return { toast: '请输入 1—500 字的命令' }
      const value = await client.call('/api/chat', { method: 'POST', body: {
        command: command.trim(), session_id: scope.sessionId || 'dsh', native: true,
      }, signal, timeoutMs: 55000 })
      results.put(`native:${keyOf(scope)}`, { ...value, command, sessionId: scope.sessionId })
      return { patch: resultPatch(scope), toast: value.ok ? '查询完成' : '命令未完成，请查看结果' }
    })

    nctx.dshGo.panel('waves-home', {
      view: (_scope, caps) => {
        if (!canV2(caps)) return { type: 'stack', children: [text('请在对话中发送 /ww 查询；完整原生面板需要支持视图 v2 的 App。'),
          { type: 'text', text: { $: 'data.summary' } }] }
        return { v: 2, type: 'stack', children: [
          { type: 'form', submit: 'query', submitLabel: '执行命令', children: [
            { type: 'textField', label: '鸣潮命令', placeholder: '查询、体力、椿面板、帮助', bind: 'data.form.command', required: true, maxLength: 500 },
          ] },
          { type: 'actions', items: [action('帮助', 'help'), action('刷新结果', 'latest'), action('设置', 'settings')] },
          { type: 'gallery', items: { $: 'data.images' }, columns: 2 },
          { type: 'text', text: { $: 'data.summary' } },
        ] }
      },
      data: (scope, emit) => { emit(resultPatch(scope)); return () => {} },
      actions: {
        query: (scope, event) => run(scope, event.value?.values?.['data.form.command']),
        help: (scope) => run(scope, 'ww帮助'),
        latest: (scope) => ({ patch: resultPatch(scope) }),
        settings: () => ({ open: 'panel:waves-settings' }),
      },
    })

    nctx.dshGo.panel('waves-settings', {
      view: async (scope, caps) => {
        if (!canV2(caps)) return { type: 'stack', children: [text('原生设置需要支持视图 v2 的 App。')] }
        try {
          const groups = (await config()).groups || []
          const s = state(scope)
          s.group = Math.max(0, Math.min(s.group, groups.length - 1))
          const group = groups[s.group]
          const items = group?.items || []
          s.page = Math.max(0, Math.min(s.page, Math.ceil(items.length / 12) - 1))
          return { v: 2, type: 'stack', children: [
            text(`${group?.name || '配置'} · ${s.page + 1}/${Math.max(1, Math.ceil(items.length / 12))}`),
            { type: 'actions', items: [action('上一组', 'group', { delta: -1 }), action('下一组', 'group', { delta: 1 }), action('刷新', 'reload')] },
            { type: 'list', items: items.slice(s.page * 12, s.page * 12 + 12).map((item) => ({
              title: String(item.title || item.key).slice(0, 80),
              subtitle: item.secret ? (item.is_set ? '已设置，点按可从文件更新' : '未设置，点按可从文件导入') : String(typeof item.value === 'object' ? JSON.stringify(item.value) : item.value).slice(0, 120),
              action: { id: 'edit', args: { group: group.name, key: item.key } },
            })) },
            { type: 'actions', items: [action('上一页', 'page', { delta: -1 }), action('下一页', 'page', { delta: 1 }), action('返回查询', 'home')] },
          ] }
        } catch { return { type: 'stack', children: [text('服务尚未就绪，请稍后重试。'), { type: 'actions', items: [action('重试', 'reload')] }] } }
      },
      actions: {
        group: (scope, event) => { const s = state(scope); s.group = Math.max(0, s.group + (event.value?.delta === -1 ? -1 : 1)); s.page = 0; return { refresh: true } },
        page: (scope, event) => { const s = state(scope); s.page = Math.max(0, s.page + (event.value?.delta === -1 ? -1 : 1)); return { refresh: true } },
        reload: () => ({ refresh: true }),
        home: () => ({ open: 'panel:waves-home' }),
        edit: async (scope, event) => {
          const groups = (await config()).groups || []
          const group = groups.find((g) => g.name === event.value?.group)
          const item = group?.items?.find((i) => i.key === event.value?.key)
          if (!item) return { toast: '配置项不存在' }
          Object.assign(state(scope), { editGroup: group.name, editKey: event.value.key })
          // The bridge retains panel feeds for 30s. Reset a reused editor feed
          // before opening the next setting, so an old draft is never reused.
          return [{ type: 'patch', id: 'waves-edit', data: editData(item) }, { open: 'panel:waves-edit' }]
        },
      },
    })

    nctx.dshGo.panel('waves-edit', {
      view: async (scope, caps) => {
        if (!canV2(caps)) return { type: 'stack', children: [text('此设置需要支持视图 v2 的 App。')] }
        try {
          const { item } = await selected(scope)
          const children = [text(item.title || item.key), text(item.desc || '修改后点保存。')]
          if (item.needs_restart) children.push({ type: 'callout', tone: 'info', text: '修改此项后需要重启引擎或鸣潮服务。' })
          if (item.secret) {
            children.push(text(item.is_set ? '已设置，原值不会显示。' : '尚未设置。'))
            children.push(text('将此项值单独保存为 UTF-8 文本文件，点下面按钮导入；内容不会出现在对话或面板中。'))
            children.push({ type: 'actions', items: [action('从文件更新', 'pick'), action('返回设置', 'back')] })
          } else if (item.upload && !item.upload.with_text) {
            children.push(text(item.upload.exists ? '已有文件，可选择新文件替换。' : '尚未上传文件。'))
            children.push({ type: 'actions', items: [action('选择文件', 'pick'), action('返回设置', 'back')] })
          } else {
            const type = item.type === 'BoolConfig' ? 'toggle' : ['IntConfig', 'FloatConfig'].includes(item.type) ? 'number' : item.options?.length ? 'select' : 'textField'
            const input = { type, label: '新值', bind: 'data.form.value' }
            if (type === 'select') input.options = item.options.slice(0, 24).map(String)
            if (type === 'textField') Object.assign(input, { maxLength: 1000, multiline: item.type.includes('List') || item.type === 'DictConfig', maxLines: 4 })
            children.push({ type: 'form', submit: 'save', submitLabel: '保存', children: [input] })
            children.push({ type: 'actions', items: [action('返回设置', 'back')] })
          }
          children.push({ type: 'text', text: { $: 'data.notice' } })
          return { v: 2, type: 'stack', children }
        } catch { return { type: 'stack', children: [text('请先从设置列表选择一项。'), { type: 'actions', items: [action('返回设置', 'back')] }] } }
      },
      data: (scope, emit) => {
        let active = true
        selected(scope).then(({ item }) => {
          if (!active) return
          emit(editData(item))
        }).catch(() => { if (active) emit({ form: { value: '' } }) })
        return () => { active = false }
      },
      actions: {
        back: () => ({ open: 'panel:waves-settings' }),
        save: (scope, event) => pending('正在保存', async (signal) => {
          const { group, item } = await selected(scope)
          if (item.secret || item.upload && !item.upload.with_text) return { toast: '请使用文件导入' }
          const value = event.value?.values?.['data.form.value']
          if (value === undefined || value === null || JSON.stringify(value).length > 2000) return { toast: '请填写有效值' }
          if (item.type === 'BoolConfig' && typeof value !== 'boolean') return { toast: '请填写开关值' }
          if (['IntConfig', 'FloatConfig'].includes(item.type) && (typeof value !== 'number' || !Number.isFinite(value) || item.type === 'IntConfig' && !Number.isInteger(value))) return { toast: '请填写有效数字' }
          if (item.options && !item.options.map(String).includes(String(value))) return { toast: '请选择列表中的值' }
          const result = await client.call('/api/config', { method: 'POST', body: { group: group.name, key: item.key, value }, signal, timeoutMs: 5000 })
          return { patch: { form: { value } }, toast: result.needs_restart ? '已保存，重启后生效' : '已保存' }
        }),
        pick: () => ({ type: 'pickFile', action: 'import-file', maxFiles: 1 }),
        'import-file': async (scope, event) => {
          try {
          if (event.value?.status !== 'selected') return { patch: { notice: '已取消' } }
          const file = event.value.files?.[0]
          if (!file || typeof nctx.dshGo.readPickedFile !== 'function') return { patch: { notice: '无法读取文件' } }
          // Read while the callback lease is active; never return the contents.
          const bytes = nctx.dshGo.readPickedFile(file.handle)
          const { group, item } = await selected(scope)
          if (item.secret) {
            if (bytes.length > 16000) return { patch: { notice: '凭据文件过大' } }
            const value = bytes.toString('utf8').trim()
            if (!value || value.length > 8000) return { patch: { notice: '凭据文件无效' } }
            await client.call('/api/config', { method: 'POST', body: { group: group.name, key: item.key, value }, timeoutMs: 1800 })
          } else if (item.upload) {
            await client.call('/api/config/upload', { method: 'POST', body: { group: group.name, key: item.key, data: bytes.toString('base64') }, timeoutMs: 1800 })
          } else return { patch: { notice: '此项不支持文件导入' } }
          return { patch: { notice: '已保存，原值不会显示', form: { value: '' } } }
          } catch { return { patch: { notice: '导入失败，请检查文件后重试' } } }
        },
      },
    })
  })
}
