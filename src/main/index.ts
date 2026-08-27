import 'dotenv/config'
import { app, shell, BrowserWindow, protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { extname, join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { shutdownExiftool } from './metadata/exiftoolClient'
import { registerIpcHandlers } from './ipc/handlers'
import { classifyMediaType } from './metadata/classifyMediaType'

let mainWindow: BrowserWindow | null = null

const MEDIA_PROTOCOL = 'saara-media'

protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_PROTOCOL,
    privileges: { standard: true, secure: true, stream: true }
  }
])

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mts': 'video/mp2t',
  '.m4v': 'video/x-m4v'
}

function mediaTypeFor(filePath: string): string {
  return VIDEO_CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'video/mp4'
}

// fallow-ignore-next-line complexity -- validates all RFC 7233 single-range forms.
function byteRange(range: string | null, size: number): { start: number; end: number } | null {
  if (!range) return { start: 0, end: size - 1 }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  if (!match) return null

  const [, startText, endText] = match
  if (!startText && !endText) return null
  if (!startText) {
    const length = Number(endText)
    if (!Number.isSafeInteger(length) || length <= 0) return null
    return { start: Math.max(0, size - length), end: size - 1 }
  }

  const start = Number(startText)
  const end = endText ? Number(endText) : size - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null
  }
  return { start, end: Math.min(end, size - 1) }
}

// fallow-ignore-next-line complexity -- translates file and range errors into HTTP responses.
async function handleMediaRequest(request: Request): Promise<Response> {
  const filePath = new URL(request.url).searchParams.get('path')
  if (!filePath || classifyMediaType(filePath) !== 'video') {
    return new Response(null, { status: 403 })
  }

  try {
    const file = await stat(filePath)
    if (!file.isFile()) return new Response(null, { status: 404 })

    const rangeHeader = request.headers.get('range')
    if (file.size === 0) {
      return new Response(null, {
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': '0',
          'Content-Type': mediaTypeFor(filePath)
        }
      })
    }

    const range = byteRange(rangeHeader, file.size)
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${file.size}` }
      })
    }

    const length = range.end - range.start + 1
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Content-Length': String(length),
      'Content-Type': mediaTypeFor(filePath)
    })
    if (rangeHeader) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`)
    if (request.method === 'HEAD')
      return new Response(null, { status: rangeHeader ? 206 : 200, headers })

    return new Response(Readable.toWeb(createReadStream(filePath, range)) as ReadableStream, {
      status: rangeHeader ? 206 : 200,
      headers
    })
  } catch {
    return new Response(null, { status: 404 })
  }
}

function createWindow(): void {
  // Create the browser window.
  const window = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow = window

  window.on('ready-to-show', () => {
    window.show()
  })

  window.on('closed', () => {
    mainWindow = null
  })

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.saara.app')

  protocol.handle(MEDIA_PROTOCOL, handleMediaRequest)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers(() => mainWindow)

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  void shutdownExiftool()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
