import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { actions, useAppDispatch, useAppSelector } from '../store'
import { fetchContainers, type SortKey } from '../store/slices'
import { buildRows, type Row } from '../lib/rows'
import { Confirm, Icon, formatBytes, relativeTime, useAction, useNow } from '../components/ui'
import type { BulkAction } from '../../../shared/types'

interface Col {
  id: string
  label: string
  sort?: SortKey
  num?: boolean
  hideable: boolean
  render: (r: Row, ctx: { ncpu: number; now: number }) => ReactNode
}

const dash = (r: Row, v: ReactNode): ReactNode => (r.hasStats || r.kind === 'project' ? v : '—')

const COLUMNS: Col[] = [
  {
    id: 'image',
    label: 'Image',
    sort: 'image',
    hideable: false,
    render: (r) => <span className={r.kind === 'project' ? 'muted' : ''}>{r.image}</span>
  },
  { id: 'ports', label: 'Port(s)', hideable: false, render: (r) => r.ports || '—' },
  {
    id: 'cpu',
    label: 'CPU (%)',
    sort: 'cpu',
    num: true,
    hideable: true,
    render: (r, { ncpu }) =>
      r.state === 'running' || r.kind === 'project'
        ? dash(r, <span className={r.cpu > 80 * ncpu ? 'cpu-warn' : ''}>{r.cpu.toFixed(2)}%</span>)
        : '—'
  },
  {
    id: 'memory',
    label: 'Memory usage/limit',
    sort: 'memory',
    num: true,
    hideable: true,
    render: (r) => dash(r, r.hasStats ? `${formatBytes(r.memUsage)} / ${formatBytes(r.memLimit)}` : '—')
  },
  {
    id: 'memoryPercentage',
    label: 'Memory (%)',
    num: true,
    hideable: true,
    render: (r) => dash(r, `${r.memPct.toFixed(2)}%`)
  },
  {
    id: 'disk',
    label: 'Disk read/write',
    num: true,
    hideable: true,
    render: (r) => dash(r, `${formatBytes(r.blockRead)} / ${formatBytes(r.blockWrite)}`)
  },
  {
    id: 'network',
    label: 'Network I/O',
    num: true,
    hideable: true,
    render: (r) => dash(r, `${formatBytes(r.netRead)} / ${formatBytes(r.netWrite)}`)
  },
  { id: 'pids', label: 'PIDS', num: true, hideable: true, render: (r) => dash(r, r.pids) },
  {
    id: 'started',
    label: 'Last started',
    sort: 'started',
    hideable: false,
    render: (r, { now }) => relativeTime(r.startedAt, now)
  }
]

type Pending = { action: BulkAction; ids: string[]; label: string } | null

export function ContainersPage(): ReactNode {
  const dispatch = useAppDispatch()
  const c = useAppSelector((s) => s.containers)
  const stats = useAppSelector((s) => s.stats)
  const ncpu = useAppSelector((s) => s.engine.status?.ncpu ?? 1)
  const run = useAction()
  const now = useNow()
  const [pending, setPending] = useState<Pending>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    void dispatch(fetchContainers())
  }, [dispatch])

  const rows = useMemo(
    () =>
      buildRows(c.items, {
        stats: stats.byContainer,
        filter: c.filter,
        search: c.search,
        sortKey: c.sortKey,
        sortDir: c.sortDir
      }),
    [c.items, stats.byContainer, c.filter, c.search, c.sortKey, c.sortDir]
  )
  const visibleIds = useMemo(() => rows.flatMap((r) => r.ids), [rows])
  const shownCols = COLUMNS.filter((col) => !c.hiddenColumns.includes(col.id))
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => c.selected.includes(id))

  const doBulk = async (action: BulkAction, ids: string[]): Promise<void> => {
    const ok = await run(async () => {
      const results = await window.desktopIpcClient.containers.containersBulkAction(ids, action)
      const failed = results.filter((r) => !r.ok)
      if (failed.length) throw new Error(`${failed.length} of ${results.length} failed: ${failed[0].error}`)
    })
    await dispatch(fetchContainers())
    if (ok && action === 'remove') dispatch(actions.containers.clearSelected())
  }

  const ask = (action: BulkAction, ids: string[], label: string): void => {
    if (action === 'remove') setPending({ action, ids, label })
    else void doBulk(action, ids)
  }

  const sortMark = (k?: SortKey): string => (k && c.sortKey === k ? (c.sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  const renderRow = (r: Row, child: boolean): ReactNode => {
    const selected = r.ids.every((id) => c.selected.includes(id))
    const running = r.state === 'running'
    const expanded = c.expanded.includes(r.name)
    return (
      <Fragment key={r.key}>
        <tr className={`${selected ? 'selected' : ''} ${child ? 'child' : ''}`} data-testid={`row-${r.kind}`} data-name={r.name}>
          <td>
            <input
              type="checkbox"
              aria-label={`select ${r.name}`}
              checked={selected}
              onChange={() => dispatch(actions.containers.toggleSelected(r.ids))}
            />
          </td>
          <td>
            <span className="name-cell">
              {r.kind === 'project' ? (
                <button className="caret" onClick={() => dispatch(actions.containers.toggleExpanded(r.name))} aria-label="expand">
                  <Icon name={expanded ? 'chevronD' : 'chevronR'} />
                </button>
              ) : null}
              <span className={`dot ${r.state === 'running' ? 'run' : r.state === 'partial' || r.state === 'paused' ? 'paused' : ''}`} title={r.status} />
              {r.kind === 'container' ? (
                <button className="link" onClick={() => dispatch(actions.nav.navigate({ name: 'container', id: r.ids[0], tab: 'logs' }))}>
                  {r.name}
                </button>
              ) : (
                <strong>{r.name}</strong>
              )}
              {r.kind === 'project' && <span className="badge">{r.status}</span>}
            </span>
          </td>
          {shownCols.map((col) => (
            <td key={col.id} className={col.num ? 'num' : ''}>
              {col.render(r, { ncpu, now })}
            </td>
          ))}
          <td className="pin">
            {running ? (
              <button className="icon" title="Stop" onClick={() => ask('stop', r.ids, r.name)}>
                <Icon name="stop" />
              </button>
            ) : (
              <button className="icon" title="Start" onClick={() => ask('start', r.ids, r.name)}>
                <Icon name="play" />
              </button>
            )}{' '}
            <button className="icon" title="Restart" onClick={() => ask('restart', r.ids, r.name)}>
              <Icon name="restart" />
            </button>{' '}
            <button className="icon danger" title="Delete" onClick={() => ask('remove', r.ids, r.name)}>
              <Icon name="trash" />
            </button>
          </td>
        </tr>
        {r.kind === 'project' && expanded && r.children?.map((ch) => renderRow(ch, true))}
      </Fragment>
    )
  }

  return (
    <>
      <div className="page-head">
        <h1>Containers</h1>
        <span className="muted">{c.items.length} total</span>
        <button className="primary" onClick={() => dispatch(actions.nav.navigate({ name: 'run' }))}>
          <Icon name="plus" /> Run container
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name or image"
          value={c.search}
          onChange={(e) => dispatch(actions.containers.setSearch(e.target.value))}
          aria-label="search"
        />
        <select value={c.filter} onChange={(e) => dispatch(actions.containers.setFilter(e.target.value as never))} aria-label="state filter">
          <option value="all">All states</option>
          <option value="running">Running</option>
          <option value="stopped">Stopped</option>
        </select>
        {c.selected.length > 0 && (
          <div className="bulkbar" data-testid="bulkbar">
            <strong>{c.selected.length} selected</strong>
            <button onClick={() => ask('start', c.selected, `${c.selected.length} containers`)}>Start</button>
            <button onClick={() => ask('stop', c.selected, `${c.selected.length} containers`)}>Stop</button>
            <button className="danger" onClick={() => ask('remove', c.selected, `${c.selected.length} containers`)}>
              Delete
            </button>
          </div>
        )}
        <span style={{ flex: 1 }} />
        {stats.status === 'error' && (
          <span className="badge warn" title={stats.error ?? ''}>
            stats unavailable
          </span>
        )}
        <div className="menu">
          <button onClick={() => setMenuOpen(!menuOpen)}>Columns ▾</button>
          {menuOpen && (
            <div className="menu-pop">
              {COLUMNS.filter((x) => x.hideable).map((col) => (
                <label key={col.id}>
                  <input
                    type="checkbox"
                    checked={!c.hiddenColumns.includes(col.id)}
                    onChange={() => dispatch(actions.containers.toggleColumn(col.id))}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button className="icon" title="Refresh" onClick={() => void dispatch(fetchContainers())}>
          <Icon name="refresh" />
        </button>
      </div>

      {c.error && <div className="notice">{c.error}</div>}
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <div className="empty">{c.loaded ? 'No containers match.' : 'Loading…'}</div>
        ) : (
          <table className="grid" data-testid="container-grid">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="select all"
                    checked={allSelected}
                    onChange={() => dispatch(actions.containers.toggleSelected(visibleIds))}
                  />
                </th>
                <th className="sortable" onClick={() => dispatch(actions.containers.setSort('name'))}>
                  Name{sortMark('name')}
                </th>
                {shownCols.map((col) => (
                  <th
                    key={col.id}
                    className={`${col.sort ? 'sortable' : ''} ${col.num ? 'num' : ''}`}
                    onClick={() => col.sort && dispatch(actions.containers.setSort(col.sort))}
                  >
                    {col.label}
                    {sortMark(col.sort)}
                  </th>
                ))}
                <th className="pin">Actions</th>
              </tr>
            </thead>
            <tbody>{rows.map((r) => renderRow(r, false))}</tbody>
          </table>
        )}
      </div>

      {pending && (
        <Confirm
          title={`Delete ${pending.label}?`}
          danger
          confirmLabel="Delete"
          body={
            <p>
              {pending.ids.length} container{pending.ids.length === 1 ? '' : 's'} will be removed
              (running ones are force-stopped first). This cannot be undone.
            </p>
          }
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const p = pending
            setPending(null)
            void doBulk(p.action, p.ids)
          }}
        />
      )}
    </>
  )
}
