import { contextBridge, ipcRenderer } from 'electron'
import { flatten } from '../shared/manifest'
import type { Observer, Stream, Subscription } from '../shared/types'

// Builds the renderer-facing client from the manifest and exposes it as `desktopIpcClient`.
//  simple endpoint: invoke("<path>__wrapped"), unwrap { result, error }, throw on error.
//  stream endpoint: create a MessageChannel, hand port2 to the main process, read events from port1.

type Wrapped = { result?: unknown; error?: { message: string } }

function simple(path: string) {
  return async (...args: unknown[]): Promise<unknown> => {
    const r = (await ipcRenderer.invoke(`${path}__wrapped`, ...args)) as Wrapped | undefined
    if (r?.error) throw new Error(r.error.message)
    return r?.result
  }
}

function stream(path: string) {
  return (args: unknown = {}): Stream<unknown> => ({
    subscribe(observer: Observer<unknown>): Subscription {
      const { port1, port2 } = new MessageChannel()
      let closed = false
      port1.onmessage = (e: MessageEvent): void => {
        const m = e.data as { kind: string; value?: unknown; error?: { message: string } }
        if (m.kind === 'next') observer.next(m.value)
        else if (m.kind === 'error') observer.error?.(m.error ?? { message: 'Stream error' })
        else if (m.kind === 'complete') {
          observer.complete?.()
          close()
        }
      }
      function close(): void {
        if (closed) return
        closed = true
        port1.close()
      }
      ipcRenderer.postMessage(path, args, [port2])
      return {
        unsubscribe: close,
        send: (message: unknown): void => {
          if (!closed) port1.postMessage(message)
        }
      }
    }
  })
}

function build(): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const ep of flatten()) {
    const parts = ep.path.split('.')
    let node = root
    parts.slice(0, -1).forEach((p) => {
      node = (node[p] ??= {}) as Record<string, unknown>
    })
    node[parts[parts.length - 1]] = ep.kind === 'simple' ? simple(ep.path) : stream(ep.path)
  }
  return root
}

contextBridge.exposeInMainWorld('desktopIpcClient', build())
