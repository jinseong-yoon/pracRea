import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { actions, useAppDispatch, useAppSelector } from '../store'
import { Confirm, Icon, formatBytes, relativeTime, useAction } from '../components/ui'
import type { ImageSummary } from '../../../shared/types'

interface Row {
  img: ImageSummary
  tag: string | null
}

export function ImagesPage(): ReactNode {
  const dispatch = useAppDispatch()
  const containers = useAppSelector((s) => s.containers.items)
  const run = useAction()
  const [images, setImages] = useState<ImageSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [del, setDel] = useState<Row | null>(null)
  const [prune, setPrune] = useState(false)
  const [pruneAll, setPruneAll] = useState(false)

  const load = useCallback(async () => {
    try {
      setImages(await window.desktopIpcClient.images.dockerListImages())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  // An image is "in use" when any container (running or stopped) was created from it.
  const usedBy = (img: ImageSummary): string[] => containers.filter((c) => c.imageId === img.id).map((c) => c.name)

  // one row per tag; an untagged (dangling) image gets a single row
  const rows: Row[] = (images ?? [])
    .flatMap((img): Row[] => (img.tags.length ? img.tags.map((tag) => ({ img, tag })) : [{ img, tag: null }]))
    .sort((a, b) => b.img.createdAt - a.img.createdAt || (a.tag ?? '').localeCompare(b.tag ?? ''))
  return (
    <>
      <div className="page-head">
        <h1>Images</h1>
        <span className="muted">
          {(images ?? []).length} image{(images ?? []).length === 1 ? '' : 's'}, {formatBytes((images ?? []).reduce((a, i) => a + i.size, 0))}
        </span>
        <button onClick={() => setPrune(true)}>Prune…</button>
        <button className="icon" title="Refresh" onClick={() => void load()}>
          <Icon name="refresh" />
        </button>
      </div>
      {error && <div className="notice">{error}</div>}
      <div className="card table-wrap">
        {images === null ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">No images.</div>
        ) : (
          <table className="grid" data-testid="image-grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>ID</th>
                <th>Status</th>
                <th>Created</th>
                <th className="num">Size</th>
                <th className="pin">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ img, tag }) => {
                const users = usedBy(img)
                return (
                  <tr key={img.id + (tag ?? '')} data-name={tag ?? '<none>'}>
                    <td>{tag ?? <span className="muted">&lt;none&gt; (dangling)</span>}</td>
                    <td className="mono">{img.id.replace('sha256:', '').slice(0, 12)}</td>
                    <td>
                      {users.length ? (
                        <span className="badge" title={users.join(', ')} data-testid="in-use">
                          In use ({users.length})
                        </span>
                      ) : (
                        <span className="muted">Unused</span>
                      )}
                    </td>
                    <td>{relativeTime(img.createdAt)}</td>
                    <td className="num">{formatBytes(img.size)}</td>
                    <td className="pin">
                      {tag && (
                        <button className="icon" title="Run" onClick={() => dispatch(actions.nav.navigate({ name: 'run', image: tag }))}>
                          <Icon name="play" />
                        </button>
                      )}{' '}
                      <button className="icon danger" title="Delete" onClick={() => setDel({ img, tag })}>
                        <Icon name="trash" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {del && (
        <Confirm
          title={`Delete ${del.tag ?? del.img.id.slice(7, 19)}?`}
          danger
          confirmLabel="Delete"
          body={
            <p>
              {del.img.tags.length > 1
                ? 'Only this tag is removed; the image data stays while other tags point to it.'
                : 'The image is removed from the engine.'}{' '}
              {usedBy(del.img).length > 0 && `It is used by ${usedBy(del.img).join(', ')}; the engine may refuse.`}
            </p>
          }
          onCancel={() => setDel(null)}
          onConfirm={() => {
            const target = del
            setDel(null)
            void run(() => window.desktopIpcClient.images.dockerRemoveImage(target.tag ?? target.img.id), 'Image removed').then(load)
          }}
        />
      )}
      {prune && (
        <Confirm
          title="Prune images"
          danger
          confirmLabel="Prune"
          body={
            <>
              <p>{pruneAll ? 'Removes every image not used by any container.' : 'Removes dangling images (untagged leftovers).'}</p>
              <label>
                <input type="checkbox" data-testid="prune-all" checked={pruneAll} onChange={(e) => setPruneAll(e.target.checked)} /> Also remove all unused tagged images
              </label>
            </>
          }
          onCancel={() => setPrune(false)}
          onConfirm={() => {
            setPrune(false)
            void run(async () => {
              const r = await window.desktopIpcClient.images.dockerPruneImages({ all: pruneAll })
              dispatch(actions.toast.push('info', `Pruned ${r.deleted} image(s), reclaimed ${formatBytes(r.spaceReclaimed)}`))
            }).then(load)
          }}
        />
      )}
    </>
  )
}
