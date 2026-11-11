// Docker Engine integration. Everything in this file DELEGATES to the engine through dockerode;
// the app adds no logic of its own except shaping responses for the UI.
import Docker from 'dockerode'
import type {
  BulkAction,
  BulkResult,
  ContainerSummary,
  EngineStatus,
  ImageSummary,
  PruneResult,
  RunOptions,
  VolumeSummary
} from '../shared/types'

export const docker = new Docker() // honours DOCKER_HOST; default named pipe on Windows

const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })

let lastInfo: { ncpu: number; memTotal: number } | null = null
export const engineCpuCount = (): number => lastInfo?.ncpu ?? 1

export async function getEngineStatus(): Promise<EngineStatus> {
  try {
    const v = await withTimeout(docker.version(), 3000, 'Engine version request')
    const info = await withTimeout(docker.info(), 3000, 'Engine info request')
    lastInfo = { ncpu: info.NCPU ?? 1, memTotal: info.MemTotal ?? 0 }
    return { connected: true, version: v.Version, ncpu: lastInfo.ncpu, memTotal: lastInfo.memTotal }
  } catch (e) {
    return { connected: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const parseTime = (s: string | undefined): number | null => {
  if (!s || s.startsWith('0001-')) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}

export async function listContainers(): Promise<ContainerSummary[]> {
  const list = await docker.listContainers({ all: true })
  // The list endpoint has no start time, so ask the engine per container (in parallel).
  return Promise.all(
    list.map(async (c) => {
      let startedAt: number | null = null
      try {
        const info = await docker.getContainer(c.Id).inspect()
        startedAt = parseTime(info.State?.StartedAt)
      } catch {
        /* container may have vanished between calls */
      }
      return {
        id: c.Id,
        name: (c.Names?.[0] ?? c.Id).replace(/^\//, ''),
        image: c.Image,
        imageId: c.ImageID,
        state: c.State,
        status: c.Status,
        ports: (c.Ports ?? []).map((p) => ({
          ip: p.IP,
          privatePort: p.PrivatePort,
          publicPort: p.PublicPort,
          type: p.Type
        })),
        labels: c.Labels ?? {},
        createdAt: c.Created * 1000,
        startedAt
      }
    })
  )
}

export const inspectContainer = (id: string): Promise<unknown> => docker.getContainer(id).inspect()
export const startContainer = (id: string): Promise<void> => docker.getContainer(id).start().then(() => undefined)
export const stopContainer = (id: string): Promise<void> => docker.getContainer(id).stop().then(() => undefined)
export const restartContainer = (id: string): Promise<void> =>
  docker.getContainer(id).restart().then(() => undefined)
export const removeContainer = (id: string): Promise<void> =>
  docker.getContainer(id).remove({ force: true }).then(() => undefined)

const isNotModified = (e: unknown): boolean => (e as { statusCode?: number })?.statusCode === 304

export async function bulkAction(ids: string[], action: BulkAction): Promise<BulkResult[]> {
  const run = {
    start: startContainer,
    stop: stopContainer,
    restart: restartContainer,
    remove: removeContainer
  }[action]
  return Promise.all(
    ids.map(async (id): Promise<BulkResult> => {
      try {
        await run(id)
        return { id, ok: true }
      } catch (e) {
        if (isNotModified(e)) return { id, ok: true } // already started / already stopped
        return { id, ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })
  )
}

export async function runContainer(o: RunOptions): Promise<{ id: string }> {
  if (!o.image.trim()) throw new Error('Image name is required')
  const exposed: Record<string, object> = {}
  const bindings: Record<string, { HostPort: string }[]> = {}
  for (const p of o.ports ?? []) {
    if (!p.container.trim()) continue
    const key = `${p.container.trim()}/${p.protocol ?? 'tcp'}`
    exposed[key] = {}
    bindings[key] = [...(bindings[key] ?? []), { HostPort: p.host.trim() }] // empty host port = random
  }
  const binds = (o.volumes ?? [])
    .filter((v) => v.host.trim() && v.container.trim())
    .map((v) => `${v.host.trim()}:${v.container.trim()}`)
  const env = (o.env ?? []).filter((e) => e.key.trim()).map((e) => `${e.key.trim()}=${e.value}`)
  const c = await docker.createContainer({
    Image: o.image.trim(),
    name: o.name?.trim() || undefined,
    Env: env,
    ExposedPorts: exposed,
    HostConfig: { PortBindings: bindings, Binds: binds }
  })
  await c.start()
  return { id: c.id }
}

export async function listImages(): Promise<ImageSummary[]> {
  const imgs = await docker.listImages()
  return imgs.map((i) => ({
    id: i.Id,
    tags: (i.RepoTags ?? []).filter((t) => t !== '<none>:<none>'),
    createdAt: i.Created * 1000,
    size: i.Size,
    dangling: !i.RepoTags || i.RepoTags.length === 0 || i.RepoTags[0] === '<none>:<none>'
  }))
}

export const removeImage = (id: string): Promise<void> => docker.getImage(id).remove().then(() => undefined)

export async function pruneImages(all: boolean): Promise<PruneResult> {
  // all=false: dangling images only. all=true: every image not used by a container.
  const r = await docker.pruneImages({ filters: { dangling: { [all ? 'false' : 'true']: true } } })
  return { deleted: r.ImagesDeleted?.length ?? 0, spaceReclaimed: r.SpaceReclaimed ?? 0 }
}

export async function listVolumes(): Promise<VolumeSummary[]> {
  const [vols, df] = await Promise.all([docker.listVolumes(), docker.df()])
  const usage = new Map<string, { Size: number; RefCount: number }>()
  for (const v of (df as { Volumes?: { Name: string; UsageData?: { Size: number; RefCount: number } }[] }).Volumes ?? [])
    if (v.UsageData) usage.set(v.Name, v.UsageData)
  return (vols.Volumes ?? []).map((v) => {
    const u = usage.get(v.Name)
    return {
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      createdAt: (v as { CreatedAt?: string }).CreatedAt ?? null,
      size: u && u.Size >= 0 ? u.Size : null, // engine reports -1 when it cannot compute
      refCount: u && u.RefCount >= 0 ? u.RefCount : null
    }
  })
}

export const createVolume = (name: string): Promise<void> => {
  if (!name.trim()) throw new Error('Volume name is required')
  return docker.createVolume({ Name: name.trim() }).then(() => undefined)
}
export const removeVolume = (name: string): Promise<void> => docker.getVolume(name).remove()

export async function pruneVolumes(): Promise<PruneResult> {
  const r = await docker.pruneVolumes()
  return { deleted: r.VolumesDeleted?.length ?? 0, spaceReclaimed: r.SpaceReclaimed ?? 0 }
}
