import { ipcMain } from 'electron'
import { flatten } from '../shared/manifest'

/** What a stream handler gets: a small observer-like context bound to one MessagePort. */
export interface StreamContext {
  next(value: unknown): void
  error(err: unknown): void
  complete(): void
  /** messages sent by the renderer on the same port (bidirectional streams, e.g. exec) */
  onMessage(cb: (message: unknown) => void): void
}
export type Cleanup = () => void
export type StreamHandler = (
  args: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  ctx: StreamContext
) => void | Cleanup | Promise<void | Cleanup>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SimpleHandler = (...args: any[]) => unknown

export interface Handlers {
  simple: Record<string, SimpleHandler>
  stream: Record<string, StreamHandler>
}

export const toMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e)

/**
 * Registers every endpoint listed in the manifest.
 *  - simple: ipcMain.handle("<path>__wrapped") returning { result } or { error: { message } }
 *  - stream: ipcMain.on("<path>") receiving a MessagePort from the renderer
 */
export function registerIpc(handlers: Handlers): void {
  for (const ep of flatten()) {
    if (ep.kind === 'simple') {
      ipcMain.handle(`${ep.path}__wrapped`, async (_event, ...args) => {
        const fn = handlers.simple[ep.path]
        try {
          if (!fn) throw new Error(`Not implemented: ${ep.path}`)
          return { result: await fn(...args) }
        } catch (e) {
          return { error: { message: toMessage(e) } }
        }
      })
    } else {
      ipcMain.on(ep.path, (event, args) => {
        const port = event.ports[0]
        if (!port) return
        const handler = handlers.stream[ep.path]
        let closed = false
        let cleanup: Cleanup | void
        let messageCb: ((m: unknown) => void) | null = null
        const finish = (): void => {
          if (closed) return
          closed = true
          try {
            cleanup?.()
          } catch {
            /* ignore */
          }
          try {
            port.close()
          } catch {
            /* ignore */
          }
        }
        const send = (msg: unknown): void => {
          if (!closed) port.postMessage(msg)
        }
        port.on('message', (e) => messageCb?.(e.data))
        port.on('close', finish)
        port.start()
        if (!handler) {
          send({ kind: 'error', error: { message: `Not implemented: ${ep.path}` } })
          return
        }
        const ctx: StreamContext = {
          next: (value) => send({ kind: 'next', value }),
          error: (err) => {
            send({ kind: 'error', error: { message: toMessage(err) } })
          },
          complete: () => {
            send({ kind: 'complete' })
            finish()
          },
          onMessage: (cb) => {
            messageCb = cb
          }
        }
        Promise.resolve(handler(args, ctx)).then(
          (c) => {
            cleanup = c
            if (closed) {
              try {
                c?.()
              } catch {
                /* ignore */
              }
            }
          },
          (e) => ctx.error(e)
        )
      })
    }
  }
}
