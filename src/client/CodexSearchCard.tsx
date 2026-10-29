import { useEffect } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { CodexCardFace } from './index.tsx'
import type { CodexLocaleKey } from './locales.ts'
import css from './CodexSearchCard.module.css'

export type CodexSearchCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & PropsLocale<'web-search-codex'>
  & InjectFace<CodexCardFace>

export function CodexSearchCard(props: CodexSearchCardProps) {
  const state = props.useCodexSearchCard(snapshot => snapshot)
  useEffect(() => {
    if (props.view === 'page') return () => { props.discard() }
  }, [props.discard, props.view])
  if (!state.available) return null
  if (props.view === 'summary') return <>{props.t('description')}</>
  const settingsDisabled = !state.writable || state.saving
  const credentialWrite = state.apiKeyWritable && state.apiKey.trim() !== ''
  const saveDisabled = !state.dirty || state.saving || !state.writable && !credentialWrite
  const insecure = /^http:\/\//iu.test(state.endpoint.trim())
  const usingOpenAI = state.credentialSource === 'openai'
  const defaultsSelected = !usingOpenAI
    && state.endpoint === ''
    && state.model === ''
    && state.apiKey === ''
    && !state.apiKeyConfigured
  const reuseUnavailable = state.openAIReuse.endpoint === ''
    ? props.t('openAIUnavailable')
    : props.t('openAICredentialMissing')
  const credentialHintKey: CodexLocaleKey = usingOpenAI
    ? 'openAIKeyActive'
    : state.clearApiKey
      ? 'apiKeyClearPending'
      : state.apiKey.trim() !== ''
        ? 'apiKeyPending'
        : state.apiKeyConfigured ? 'apiKeyConfigured' : 'apiKeyMissing'
  const failureKey: CodexLocaleKey | undefined = state.failure === 'conflict'
    ? 'conflict'
    : state.failure === 'save' ? 'saveFailed' : undefined
  return (
    <div className={css.body}>
      {!state.writable ? <p className={css.readOnly} role="status">{props.t('readOnly')}</p> : null}
      <div className={css.field}>
        <div className={css.fieldHead}>
          {usingOpenAI
            ? <span className={css.label}>{props.t('apiKey')}</span>
            : <label className={css.label} htmlFor="codex-search-api-key">{props.t('apiKey')}</label>}
          <div className={css.credentialModes} role="group" aria-label={props.t('credentialMode')}>
            <button
              type="button"
              className={`${css.credentialMode} ${usingOpenAI ? css.credentialModeActive : ''}`}
              aria-pressed={usingOpenAI}
              disabled={settingsDisabled || !usingOpenAI && !state.openAIReuse.available}
              title={!usingOpenAI && !state.openAIReuse.available ? reuseUnavailable : undefined}
              onClick={props.reuseOpenAI}
            >
              {props.t('openAIMode')}
            </button>
            <button
              type="button"
              className={`${css.credentialMode} ${!usingOpenAI ? css.credentialModeActive : ''}`}
              aria-pressed={!usingOpenAI}
              disabled={settingsDisabled}
              onClick={props.useIndependentCredential}
            >
              {props.t('independentMode')}
            </button>
          </div>
        </div>
        {usingOpenAI
          ? null
          : (
            <input
              id="codex-search-api-key"
              aria-label={props.t('apiKey')}
              className={css.input}
              type="password"
              autoComplete="off"
              value={state.apiKey}
              disabled={!state.apiKeyWritable || state.saving}
              onChange={(event) => { props.edit('apiKey', event.target.value) }}
            />
          )}
        <p className={css.hint} role="status">{props.t(credentialHintKey)}</p>
      </div>
      <div className={css.field}>
        <label className={css.label} htmlFor="codex-search-endpoint">{props.t('endpoint')}</label>
        <input
          id="codex-search-endpoint"
          className={css.input}
          type="url"
          value={state.endpoint}
          disabled={settingsDisabled}
          onChange={(event) => { props.edit('endpoint', event.target.value) }}
        />
        {insecure ? <p className={css.warning} role="status">{props.t('insecure')}</p> : null}
        <p className={css.hint}>{props.t('endpointHint')}</p>
      </div>
      <div className={css.field}>
        <label className={css.label} htmlFor="codex-search-model">{props.t('model')}</label>
        <input
          id="codex-search-model"
          className={css.input}
          type="text"
          value={state.model}
          disabled={settingsDisabled}
          onChange={(event) => { props.edit('model', event.target.value) }}
        />
        <p className={css.hint}>{props.t('modelHint')}</p>
      </div>
      <div className={css.footer}>
        {state.dirty ? <span className={css.pending} role="status">{props.t('unsaved')}</span> : null}
        {failureKey === undefined ? null : <p className={css.failed} role="status">{props.t(failureKey)}</p>}
        <button
          type="button"
          className={css.restore}
          disabled={settingsDisabled || defaultsSelected}
          onClick={props.restoreDefaults}
        >
          {props.t('restoreDefaults')}
        </button>
        <button
          type="button"
          className={css.discard}
          disabled={!state.dirty || state.saving}
          onClick={props.discard}
        >
          {props.t('discard')}
        </button>
        <button
          type="button"
          className={css.save}
          disabled={saveDisabled}
          onClick={props.save}
        >
          {props.t(state.saving ? 'saving' : 'save')}
        </button>
      </div>
    </div>
  )
}
