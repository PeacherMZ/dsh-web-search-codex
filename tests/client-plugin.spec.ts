// @vitest-environment jsdom
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act, Simulate } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.tsx'
import { PACKAGE_NAME } from '../src/shared.ts'
import { zh } from '../src/client/locales.ts'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const require = createRequire(import.meta.url)
const contexts: Context[] = []
const roots: Array<ReturnType<typeof createRoot>> = []

// Published client entries use the platform's ModuleLoader wrapper, not ESM
// exports. Execute the actual renderer bundle with its real shared modules.
async function createContext() {
  let renderer: typeof import('@deepseek-ai/dsh-client-ui-renderer/client') | undefined
  const source = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-renderer/client'), 'utf8')
  new Function('window', source)({
    __ModuleLoader__: {
      load(module: { factory: (require: NodeRequire) => typeof renderer }) {
        renderer = module.factory(require)
      },
    },
  })
  if (renderer === undefined) throw new Error('renderer client bundle did not register')
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(renderer).await()
  const disposeZh = vi.fn()
  const disposeEn = vi.fn()
  const localeRegister = vi.fn()
    .mockReturnValueOnce(disposeZh)
    .mockReturnValueOnce(disposeEn)
  ctx.provide('locale', { register: localeRegister } as never)
  const snapshot = { revision: 0 }
  ctx.slots.installLocale({
    bind: () => key => zh[key as keyof typeof zh],
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  })
  const absentSession = { key: undefined, hooks: {}, keyedHooks: {}, props: {} }
  const sessionSource = { getSnapshot: () => absentSession, subscribe: () => () => {} }
  ctx.slots.installScope('session', { current: sessionSource, bindingSource: () => sessionSource })
  return { ctx, disposeZh, disposeEn, localeRegister }
}

function declareConfiguration(ctx: Context) {
  // The minimal Plugins-page owner declares the production keyed/root contract
  // and dispatches with the bundle package name, just like the real page.
  return ctx.slots.register({
    name: 'root',
    children: { 'plugins.bundle.config': { kind: 'keyed', scope: 'root' } },
  }, props => props.renderSlot('plugins.bundle.config', { view: 'page' }, { entryKey: PACKAGE_NAME }))
}

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop()
    act(() => { root?.unmount() })
  }
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
  vi.unstubAllGlobals()
})

describe('client plugin lifecycle', () => {
  it('waits for the real bundle slot, follows declaration lifetimes, and cleans up on unload', async () => {
    let requestSignal: AbortSignal | undefined
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    }))
    const { ctx, disposeZh, disposeEn, localeRegister } = await createContext()
    const plugin = ctx.plugin({ apply, inject })
    await plugin.await()
    expect(requestSignal).toBeDefined()
    expect(inject).toEqual(['slots', 'locale'])
    expect(ctx.slots.entries('plugins.bundle.config')).toEqual([])

    const release = declareConfiguration(ctx)
    expect(ctx.slots.spec('plugins.bundle.config')).toEqual({ kind: 'keyed', scope: 'root' })
    expect(ctx.slots.entries('plugins.bundle.config')).toHaveLength(1)
    expect(ctx.slots.entries('plugins.bundle.config')[0]).toMatchObject({
      options: { key: PACKAGE_NAME },
      locale: 'web-search-codex',
    })
    expect(localeRegister.mock.calls.map(call => call.slice(0, 2))).toEqual([
      ['web-search-codex', 'zh'],
      ['web-search-codex', 'en'],
    ])
    expect(requestSignal?.aborted).toBe(false)

    release()
    expect(ctx.slots.entries('plugins.bundle.config')).toEqual([])
    expect(ctx.slots.spec('plugins.bundle.config')).toBeUndefined()
    declareConfiguration(ctx)
    expect(ctx.slots.entries('plugins.bundle.config')).toHaveLength(1)

    await plugin.dispose()
    expect(ctx.slots.entries('plugins.bundle.config')).toEqual([])
    expect(disposeZh).toHaveBeenCalledOnce()
    expect(disposeEn).toHaveBeenCalledOnce()
    expect(requestSignal?.aborted).toBe(true)
  })

  it('renders and updates the bundle configuration through the real renderer and discards drafts on leaving', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      ok: true,
      value: {
        available: true,
        writable: true,
        revision: 1,
        endpoint: 'https://search.example/alpha/search',
        model: '',
        credential: { configured: false, writable: true },
      },
    })))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx } = await createContext()
    declareConfiguration(ctx)
    await ctx.plugin({ apply, inject }).await()
    const container = document.createElement('div')
    const root = createRoot(container)
    roots.push(root)
    await act(async () => { root.render(createElement('main', null, ctx.slots.renderSlot('root', {}))) })

    const endpoint = container.querySelector('#codex-search-endpoint') as HTMLInputElement
    expect(endpoint.value).toBe('https://search.example/alpha/search')
    expect(container.querySelectorAll('input')).toHaveLength(3)
    expect(container.querySelector('li, button[aria-expanded]')).toBeNull()
    const save = [...container.querySelectorAll('button')]
      .find(button => button.textContent === '保存') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    act(() => {
      endpoint.value = 'https://draft.example/alpha/search'
      Simulate.change(endpoint)
    })
    expect(save.disabled).toBe(false)
    expect(container.textContent).toContain('未保存')
    expect(fetchMock).toHaveBeenCalledOnce()

    act(() => { root.render(null) })
    act(() => { root.render(createElement('main', null, ctx.slots.renderSlot('root', {}))) })
    expect((container.querySelector('#codex-search-endpoint') as HTMLInputElement).value)
      .toBe('https://search.example/alpha/search')
    expect(container.textContent).not.toContain('未保存')
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
