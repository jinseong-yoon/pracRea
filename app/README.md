# BoxDesk

Small container dashboard: Electron + React + TypeScript (electron-vite), dockerode, xterm.js, Redux Toolkit.
Built from behaviour observed in the analysis in `../ANALYSIS.md`; differences are listed in `../DEVIATIONS.md`.

```
npm install
npm run dev          # run with hot reload
npm run build        # typecheck + production build
npm run test:lib     # pure-function tests (no Docker)
npm run test:e2e     # build, then drive the real app against your Docker engine (see below)
```

Requirements: a running Docker engine and the `docker` CLI on PATH (stats are read from `docker stats`).

## Layout

- `src/shared` — API types and the IPC manifest (single list of endpoints)
- `src/preload` — builds `window.desktopIpcClient` from the manifest (`invoke` + `{result,error}` unwrap, MessageChannel streams)
- `src/main` — `ipc.ts` (registration), `docker.ts` (dockerode, engine delegation), `stats.ts`, `streams.ts` (events, logs, exec, pull), `settings.ts`
- `src/renderer` — React pages, Redux slices, `lib/rows.ts` (compose tree)

## End-to-end checks

`scripts/run-all.mjs` creates throw-away `bxt-*` containers/volumes/images, launches the built app with a remote-debugging port,
drives it over CDP (`scripts/smoke.mjs`, checks in `scripts/checks/`) and removes exactly those fixtures afterwards.
The prune checks only run when nothing else on the engine is prunable.
