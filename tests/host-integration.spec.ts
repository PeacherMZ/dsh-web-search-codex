import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Loader, type Entry } from '@deepseek-ai/cordis-plugin-loader'
import { SettingsForms } from '@deepseek-ai/dsh-settings'
import { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'
import { describe, expect, it, vi } from 'vitest'
import * as plugin from '../src/index.ts'
import { DEFAULT_API_KEY_REF, HOST_API_PREFIX, type CodexSettingsView } from '../src/shared.ts'

// Real Cordis, Loader, SettingsForms and HTTP transport. Only the profile
// persistence seam is in-memory: edits still reconcile through Entry.update(),
// exercising the host's real schema projection and volatile commit lifecycle.
describe('real host settings integration', () => {
  it('projects the Loader schema, saves with revision fences, and hot-updates the next HTTP search without remounting', async () => {
    const ctx = new Context()
    const loader = new Loader(ctx)
    const keys = new Map([[DEFAULT_API_KEY_REF, 'integration-test-secret']])
    const credentialWrites = vi.fn()
    const providerRegistered = vi.fn<(provider: WebSearchProvider) => () => void>(() => () => {})
    ctx.provide('web', { registerSearchProvider: providerRegistered })
    ctx.provide('credentials', {
      describe: async (ref: string) => ({ configured: keys.has(ref), writable: true }),
      resolve: async (ref: string) => keys.has(ref) ? { value: keys.get(ref)!, source: 'test' } : undefined,
      set: async (ref: string, value: string) => { credentialWrites(); keys.set(ref, value) },
      unset: async (ref: string) => { credentialWrites(); keys.delete(ref) },
    })
    ctx.provide('profileContext', { home: join(tmpdir(), `codex-no-profile-${randomUUID()}`), name: 'test' })
    ctx.provide('configEditor', {
      documentPath: '',
      entries: () => [...loader.entries()],
      configuration: () => [...loader.entries()].map(entry => ({ entry, inherited: {}, override: entry.options.config ?? {} })),
      edit: async (entry: Entry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>) => {
        await entry.update({ config: change(entry.options.config ?? {}, {}) })
      },
    })

    try {
      await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
      const settingsFiber = await ctx.plugin(SettingsForms)
      const origin = ctx.webServer.getOrigin()
      const upstream: Array<{ path: string; authorization: string | undefined; model: unknown }> = []
      for (const name of ['one', 'two']) {
        ctx.effect(() => ctx.webServer.register({
          kind: 'exact',
          path: `/${name}/alpha/search`,
          handler: async (request, response) => {
            let body = ''
            for await (const chunk of request) body += String(chunk)
            upstream.push({ path: request.url!, authorization: request.headers.authorization, model: (JSON.parse(body) as { model?: unknown }).model })
            response.writeHead(200, { 'Content-Type': 'application/json' })
            response.end(JSON.stringify({ output: 'real upstream result' }))
          },
        }))
      }
      loader.builtins.codex = plugin
      const options = {
        id: 'nonstandard-codex-instance',
        name: 'cordis:codex',
        config: { endpoint: `${origin}/one/alpha/search`, model: 'model-one' },
      }
      const id = await loader.create(options)
      await loader.await()
      const entry = loader.resolve(id)
      const fiber = entry.fiber
      expect(fiber?.state).toBe(2)
      expect(providerRegistered).toHaveBeenCalledOnce()
      const provider = providerRegistered.mock.calls[0]![0]
      const descriptor = ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === id)
      expect(id).toBe('nonstandard-codex-instance')
      expect(descriptor).toMatchObject({ autoGenerate: false, applies: 'live', value: { apiKeyEnv: DEFAULT_API_KEY_REF, model: 'model-one' } })
      expect('register' in ctx.settings).toBe(false)
      expect(JSON.stringify(descriptor?.schema)).not.toContain('"volatile":true')

      const post = async (method: string, body: unknown, headers: Record<string, string> = {}) => {
        const response = await fetch(`${origin}${HOST_API_PREFIX}/${method}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
        })
        return { status: response.status, body: await response.json() as { ok: boolean; value: CodexSettingsView; error?: { code: string } } }
      }
      const initial = await post('settings.get', {})
      expect(initial.status).toBe(200)
      expect(initial.body.value).toMatchObject({ available: true, credential: { configured: true }, model: 'model-one' })
      expect(JSON.stringify(initial)).not.toContain('integration-test-secret')
      await provider.search({ query: 'before save' })
      const saved = await post('settings.save', {
        expectedRevision: initial.body.value.revision,
        endpoint: `${origin}/two/alpha/search`, model: 'model-two', apiKey: 'rotated-integration-secret',
      })
      expect(saved.status).toBe(200)
      expect(saved.body.value.revision).toBeGreaterThan(initial.body.value.revision!)
      expect(JSON.stringify(saved)).not.toContain('rotated-integration-secret')
      await provider.search({ query: 'after save' })
      expect(entry.fiber).toBe(fiber)
      expect(providerRegistered).toHaveBeenCalledOnce()
      expect(upstream).toEqual([
        { path: '/one/alpha/search', model: 'model-one', authorization: 'Bearer integration-test-secret' },
        { path: '/two/alpha/search', model: 'model-two', authorization: 'Bearer rotated-integration-secret' },
      ])

      const stale = await post('settings.save', {
        expectedRevision: initial.body.value.revision,
        endpoint: `${origin}/one/alpha/search`, model: 'stale-model', apiKey: 'must-not-write',
      })
      expect(stale).toMatchObject({ status: 409, body: { ok: false, error: { code: 'settings-conflict' } } })
      const staleCredentialOnly = await post('settings.save', {
        expectedRevision: initial.body.value.revision,
        endpoint: `${origin}/two/alpha/search`, model: 'model-two', apiKey: 'must-not-write',
      })
      expect(staleCredentialOnly).toMatchObject({ status: 409, body: { error: { code: 'settings-conflict' } } })
      expect(credentialWrites).toHaveBeenCalledOnce()
      expect(keys.get(DEFAULT_API_KEY_REF)).toBe('rotated-integration-secret')
      expect((await post('settings.get', {}, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
      expect((await post('settings.get', {}, { Origin: 'https://evil.example' })).status).toBe(403)
      expect((await post('settings.save', { expectedRevision: saved.body.value.revision, endpoint: 'file:///secret', model: '' })).status).toBe(400)
      expect((await fetch(`${origin}${HOST_API_PREFIX}/settings.get`)).status).toBe(405)

      await settingsFiber.dispose()
      expect((await post('settings.get', {})).body.value.available).toBe(false)
      expect((await post('settings.save', { expectedRevision: 0, endpoint: '', model: '' })).status).toBe(503)
      // The volatile reference belongs to Loader, not SettingsForms: searches
      // remain configured even while the optional forms service is absent.
      await provider.search({ query: 'forms temporarily absent' })
      expect(upstream.at(-1)?.path).toBe('/two/alpha/search')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
