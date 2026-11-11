import { useState, type ReactNode } from 'react'
import { actions, useAppDispatch, useAppSelector } from '../store'
import { saveSettings } from '../store/slices'
import type { DeepPartial, Settings } from '../../../shared/types'

/** Settings use the getSettings() / updateSettings(partial) pattern; every leaf is { value }. */
export function SettingsPage(): ReactNode {
  const dispatch = useAppDispatch()
  const settings = useAppSelector((s) => s.settings.value)
  const [numberDraft, setNumberDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  if (!settings) return <div className="empty">Loading settings…</div>

  const save = async (patch: DeepPartial<Settings>): Promise<void> => {
    setSaving(true)
    try {
      await dispatch(saveSettings(patch)).unwrap()
      dispatch(actions.toast.push('info', 'Settings saved'))
    } catch (e) {
      // unwrap() throws RTK's serialized error ({ message }), not an Error instance
      dispatch(actions.toast.push('error', (e as { message?: string }).message ?? String(e)))
    } finally {
      setSaving(false)
      setNumberDraft({})
    }
  }

  const numberField = (
    key: string,
    value: number,
    patch: (n: number) => DeepPartial<Settings>,
    min: number,
    max: number
  ): ReactNode => (
    <input
      type="number"
      data-testid={key}
      min={min}
      max={max}
      style={{ width: 90 }}
      value={numberDraft[key] ?? String(value)}
      onChange={(e) => setNumberDraft({ ...numberDraft, [key]: e.target.value })}
      onBlur={() => {
        const draft = numberDraft[key]
        if (draft === undefined || Number(draft) === value) return setNumberDraft({})
        void save(patch(Number(draft)))
      }}
      disabled={saving}
    />
  )

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
        <span className="muted">Saved as a JSON file in the app data folder.</span>
      </div>
      <div className="card" style={{ maxWidth: 720 }}>
        <div className="setting">
          <div className="label">
            <strong>Theme</strong>
            <div className="muted">Follow the system or force light/dark.</div>
          </div>
          <select
            data-testid="theme"
            value={settings.desktop.theme.value}
            disabled={saving}
            onChange={(e) => void save({ desktop: { theme: { value: e.target.value as 'system' | 'light' | 'dark' } } })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="setting">
          <div className="label">
            <strong>Show stopped containers</strong>
            <div className="muted">Default for the container list state filter on next start.</div>
          </div>
          <input
            type="checkbox"
            data-testid="show-stopped"
            checked={settings.desktop.showStoppedContainers.value}
            disabled={saving}
            onChange={(e) => void save({ desktop: { showStoppedContainers: { value: e.target.checked } } })}
          />
        </div>
        <div className="setting">
          <div className="label">
            <strong>Stats refresh interval (seconds)</strong>
            <div className="muted">How often the engine is asked for resource usage (2–300).</div>
          </div>
          {numberField(
            'stats-interval',
            settings.containers.statsIntervalSeconds.value,
            (n) => ({ containers: { statsIntervalSeconds: { value: n } } }),
            2,
            300
          )}
        </div>
        <div className="setting">
          <div className="label">
            <strong>Log lines loaded initially</strong>
            <div className="muted">Number of most recent lines shown when a log view opens (0–100000).</div>
          </div>
          {numberField(
            'log-tail',
            settings.containers.logTailLines.value,
            (n) => ({ containers: { logTailLines: { value: n } } }),
            0,
            100000
          )}
        </div>
      </div>
    </>
  )
}
