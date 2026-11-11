import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerIpc, type Handlers } from './ipc'
import * as engine from './docker'
import { getSettings, updateSettings, onSettingsChanged } from './settings'
import { eventsStream } from './streams'
import { statsStream } from './stats'

const handlers: Handlers = {
  simple: {
    'engine.getEngineStatus': engine.getEngineStatus,
    'containers.dockerListContainers': engine.listContainers,
    'containers.dockerInspectContainer': engine.inspectContainer,
    'containers.dockerStartContainer': engine.startContainer,
    'containers.dockerStopContainer': engine.stopContainer,
    'containers.dockerRestartContainer': engine.restartContainer,
    'containers.dockerRemoveContainer': engine.removeContainer,
    'containers.containersBulkAction': engine.bulkAction,
    'containers.dockerRunContainer': engine.runContainer,
    'images.dockerListImages': engine.listImages,
    'images.dockerRemoveImage': engine.removeImage,
    'images.dockerPruneImages': (args: { all: boolean }) => engine.pruneImages(!!args?.all),
    'volumes.listWithSizes': engine.listVolumes,
    'volumes.create': engine.createVolume,
    'volumes.remove': engine.removeVolume,
    'volumes.prune': engine.pruneVolumes,
    getSettings: () => getSettings(),
    updateSettings: updateSettings
  },
  stream: {
    'engine.dockerStreamEvents': eventsStream,
    'systemResources.openStatsStream': statsStream
  }
}

function applyTheme(): void {
  nativeTheme.themeSource = getSettings().desktop.theme.value
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    title: 'BoxDesk',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // preload needs MessageChannel + ipcRenderer; contextIsolation stays on
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.boxdesk.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerIpc(handlers)
  applyTheme()
  onSettingsChanged(applyTheme)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
