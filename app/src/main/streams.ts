// Stream endpoints implemented on top of dockerode streams.
import { PassThrough } from 'stream'
import { docker } from './docker'
import type { StreamHandler } from './ipc'
import type { EngineEvent, LogEvent, PullProgress } from '../shared/types'

/** Splits a byte stream into lines, keeping the unfinished tail between chunks. */
function lineSplitter(onLine: (line: string) => void): { write(chunk: Buffer): void; flush(): void } {
  let tail = ''
  return {
    write(chunk) {
      tail += chunk.toString('utf8')
      const parts = tail.split(/\r?\n/)
      tail = parts.pop() ?? ''
      parts.forEach(onLine)
    },
    flush() {
      if (tail) onLine(tail)
      tail = ''
    }
  }
}

// engine.dockerStreamEvents: engine events, reduced to what the UI needs to know when to refresh.
export const eventsStream: StreamHandler = async (_args, ctx) => {
  const stream = await docker.getEvents()
  const split = lineSplitter((line) => {
    try {
      const e = JSON.parse(line)
      const ev: EngineEvent = { type: e.Type, action: e.Action, id: e.Actor?.ID ?? e.id ?? '' }
      ctx.next(ev)
    } catch {
      /* ignore partial/non-JSON line */
    }
  })
  stream.on('data', (b: Buffer) => split.write(b))
  stream.on('error', (e: Error) => ctx.error(e))
  stream.on('end', () => ctx.complete())
  return () => (stream as unknown as NodeJS.ReadableStream & { destroy(): void }).destroy()
}

// containers.openContainerLogsStream: follow the engine log stream, emit one event per line.
export const logsStream: StreamHandler = async (args: { containerId: string; tail?: number }, ctx) => {
  const container = docker.getContainer(args.containerId)
  const info = await container.inspect()
  const service = info.Config?.Labels?.['com.docker.compose.service'] ?? info.Name.replace(/^\//, '')
  const stream = (await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    timestamps: true,
    tail: args.tail ?? 200
  })) as unknown as NodeJS.ReadableStream & { destroy(): void }

  const emit = (stream_: 'stdout' | 'stderr') => (raw: string) => {
    // timestamps:true prefixes each line with an RFC3339 time and a space
    const sp = raw.indexOf(' ')
    let timestamp: number | null = null
    let line = raw
    if (sp > 20) {
      const t = Date.parse(raw.slice(0, sp))
      if (!Number.isNaN(t)) {
        timestamp = t
        line = raw.slice(sp + 1)
      }
    }
    const ev: LogEvent = { line, service, timestamp, stream: stream_ }
    ctx.next(ev)
  }
  const out = lineSplitter(emit('stdout'))
  const err = lineSplitter(emit('stderr'))

  if (info.Config?.Tty) {
    // With a TTY the engine sends a raw stream (no stdout/stderr multiplexing).
    stream.on('data', (b: Buffer) => out.write(b))
  } else {
    const o = new PassThrough()
    const e = new PassThrough()
    o.on('data', (b: Buffer) => out.write(b))
    e.on('data', (b: Buffer) => err.write(b))
    docker.modem.demuxStream(stream, o, e)
  }
  stream.on('error', (e: Error) => ctx.error(e))
  stream.on('end', () => {
    out.flush()
    err.flush()
    ctx.complete()
  })
  return () => stream.destroy()
}

// images.dockerPullImage: aggregate per-layer progress into one percentage.
export const pullStream: StreamHandler = async (args: { image: string }, ctx) => {
  let image = args.image.trim()
  if (!image) throw new Error('Image name is required')
  const lastSlash = image.lastIndexOf('/')
  if (!image.includes('@') && !image.slice(lastSlash + 1).includes(':')) image += ':latest'

  const layers = new Map<string, { current: number; total: number; done: boolean }>()
  let destroyed = false
  const stream = await docker.pull(image)
  const report = (status: string): void => {
    let cur = 0
    let tot = 0
    layers.forEach((l) => {
      if (l.total > 0) {
        tot += l.total
        cur += l.done ? l.total : Math.min(l.current, l.total)
      }
    })
    const p: PullProgress = { percent: tot > 0 ? Math.round((cur / tot) * 100) : 0, status }
    ctx.next(p)
  }
  docker.modem.followProgress(
    stream,
    (err: Error | null) => {
      if (destroyed) return
      if (err) return ctx.error(err)
      ctx.next({ percent: 100, status: `Pulled ${image}` } satisfies PullProgress)
      ctx.complete()
    },
    (ev: { id?: string; status?: string; progressDetail?: { current?: number; total?: number } }) => {
      if (ev.id) {
        const l = layers.get(ev.id) ?? { current: 0, total: 0, done: false }
        if (ev.progressDetail?.total) {
          l.current = ev.progressDetail.current ?? l.current
          l.total = ev.progressDetail.total
        }
        if (ev.status === 'Pull complete' || ev.status === 'Already exists') l.done = true
        layers.set(ev.id, l)
      }
      report(ev.id ? `${ev.id}: ${ev.status ?? ''}` : (ev.status ?? ''))
    }
  )
  return () => {
    destroyed = true
    ;(stream as unknown as { destroy(): void }).destroy()
  }
}

// containers.containerExec: interactive shell over a TTY exec session (bidirectional).
export const execStream: StreamHandler = async (args: { containerId: string }, ctx) => {
  const container = docker.getContainer(args.containerId)
  const exec = await container.exec({
    Cmd: ['/bin/sh', '-c', 'command -v bash >/dev/null 2>&1 && exec bash || exec sh'],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: ['TERM=xterm-256color']
  })
  const stream = await exec.start({ hijack: true, stdin: true, Tty: true })
  stream.on('data', (b: Buffer) => ctx.next(b.toString('utf8')))
  stream.on('error', (e: Error) => ctx.error(e))
  stream.on('end', () => ctx.complete())
  ctx.onMessage((m) => {
    const msg = m as { type: string; data?: string; cols?: number; rows?: number }
    if (msg.type === 'input' && msg.data) stream.write(msg.data)
    else if (msg.type === 'resize' && msg.cols && msg.rows)
      exec.resize({ w: msg.cols, h: msg.rows }).catch(() => undefined)
  })
  return () => stream.end()
}
