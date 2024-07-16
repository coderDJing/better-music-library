import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import {
  updateTargetDirSubdirOrder,
  getLibrary,
  collectFilesWithExtensions,
  executeScript
} from './utils.js'
import layoutConfigFileUrl from '../../resources/config/layoutConfig.json?commonjs-external&asset'
import analyseSongFingerprintPyScriptUrl from '../../resources/pyScript/analyseSongFingerprint/analyseSongFingerprint.exe?commonjs-external&asset'
import { v4 as uuidv4 } from 'uuid'

const fs = require('fs-extra')
const path = require('path')

let layoutConfig = fs.readJSONSync(layoutConfigFileUrl)
let songFingerprintList = []
const libraryInit = async () => {
  let rootDescription = {
    uuid: uuidv4(),
    type: 'root',
    dirName: 'library',
    order: 1
  }
  await fs.outputJson(join(__dirname, 'library', 'description.json'), rootDescription)
  const makeLibrary = async (libraryPath, libraryName, order) => {
    let description = {
      uuid: uuidv4(),
      type: 'library',
      dirName: libraryName,
      order: order
    }
    await fs.outputJson(join(libraryPath, 'description.json'), description)
  }
  await makeLibrary(join(__dirname, 'library/筛选库'), '筛选库', 1)
  await makeLibrary(join(__dirname, 'library/精选库'), '精选库', 2)
  await fs.outputJSON(join(__dirname, 'songFingerprint', 'songFingerprint.json'), [])
}
let isLibraryExist = fs.pathExistsSync(join(__dirname, 'library', 'description.json'))
if (!isLibraryExist) {
  libraryInit()
} else {
  songFingerprintList = fs.readJSONSync(join(__dirname, 'songFingerprint', 'songFingerprint.json'))
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 500,
    minHeight: 300,
    frame: false,
    transparent: false,
    show: false,

    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.webContents.send('mainWin-max', true)
    } else {
      mainWindow.webContents.send('mainWin-max', false)
    }
    mainWindow.webContents.send('layoutConfigReaded', layoutConfig)
  })

  ipcMain.on('layoutConfigChanged', (e, layoutConfig) => {
    fs.outputJson(layoutConfigFileUrl, JSON.parse(layoutConfig))
  })
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('mainWin-max', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('mainWin-max', false)
  })
  ipcMain.on('toggle-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.on('toggle-minimize', () => {
    mainWindow.minimize()
  })

  ipcMain.on('toggle-close', () => {
    app.exit()
  })
  ipcMain.on('collapseButtonHandleClick', (e, libraryName) => {
    mainWindow.webContents.send('collapseButtonHandleClick', libraryName)
  })

  ipcMain.on('startImportSongs', async (e, formData) => {
    formData.songListPath = join(__dirname, formData.songListPath)
    let songFileUrls = await collectFilesWithExtensions(formData.folderPath, [
      '.mp3',
      '.wav',
      '.flac'
    ])
    let processNum = 0
    let fingerprintResults = []
    let delList = []
    let songFingerprintListLengthBefore = songFingerprintList.length
    let importSongsCount = 0
    async function moveSong() {
      importSongsCount = songFileUrls.length
      processNum = 0
      mainWindow.webContents.send(
        'progressSet',
        formData.isDeleteSourceFile ? '移动曲目中' : '复制曲目中',
        processNum,
        songFileUrls.length
      )
      for (let songFileUrl of songFileUrls) {
        let targetPath = join(formData.songListPath, songFileUrl.match(/[^\\]+$/)[0])
        let isExist = await fs.pathExists(targetPath)
        if (isExist) {
          let counter = 1
          let baseName = path.basename(targetPath, path.extname(targetPath))
          let extension = path.extname(targetPath)
          let directory = path.dirname(targetPath)
          let newFileName = `${baseName} (${counter})${extension}`
          while (await fs.pathExists(join(directory, newFileName))) {
            counter++
            newFileName = `${baseName} (${counter})${extension}`
          }
          if (formData.isDeleteSourceFile) {
            fs.move(songFileUrl, join(directory, newFileName))
          } else {
            fs.copy(songFileUrl, join(directory, newFileName))
          }
        } else {
          if (formData.isDeleteSourceFile) {
            fs.move(songFileUrl, targetPath)
          } else {
            fs.copy(songFileUrl, targetPath)
          }
        }
        processNum++
        mainWindow.webContents.send(
          'progressSet',
          formData.isDeleteSourceFile ? '移动曲目中' : '复制曲目中',
          processNum,
          songFileUrls.length
        )
      }
    }

    async function analyseSongFingerprint() {
      mainWindow.webContents.send(
        'progressSet',
        '分析声音指纹初始化中',
        processNum,
        songFileUrls.length
      )
      processNum = 0
      const endHandle = () => {
        processNum++
        mainWindow.webContents.send(
          'progressSet',
          '分析声音指纹中',
          processNum,
          songFileUrls.length
        )
      }
      fingerprintResults = await executeScript(
        analyseSongFingerprintPyScriptUrl,
        [formData.folderPath, ['.mp3', '.wav', '.flac'].join(',')],
        endHandle
      )
    }

    if (!formData.isComparisonSongFingerprint && !formData.isPushSongFingerprintLibrary) {
      //既不比对，也不加入指纹库
      await moveSong()
    } else if (formData.isComparisonSongFingerprint) {
      //比对声音指纹
      await analyseSongFingerprint()

      let toBeRemoveDuplicates = []

      for (let item of fingerprintResults) {
        if (songFingerprintList.indexOf(item.md5_hash) != -1) {
          delList.push(item.path)
        } else {
          toBeRemoveDuplicates.push(item)
        }
      }
      let map = new Map()
      let duplicates = []
      // 待去重数组（本地导入的曲包内部去重）
      toBeRemoveDuplicates.forEach((item) => {
        if (map.has(item.md5_hash)) {
          duplicates.push(item.path)
        } else {
          map.set(item.md5_hash, item)
        }
      })
      delList = delList.concat(duplicates) //待删数组
      let toBeDealSongs = Array.from(map.values())

      processNum = 0
      mainWindow.webContents.send(
        'progressSet',
        formData.isDeleteSourceFile ? '移动曲目中' : '复制曲目中',
        processNum,
        toBeDealSongs.length
      )
      importSongsCount = toBeDealSongs.length
      for (let item of toBeDealSongs) {
        if (formData.isPushSongFingerprintLibrary) {
          songFingerprintList.push(item.md5_hash)
        }
        let targetPath = join(formData.songListPath, item.path.match(/[^\\]+$/)[0])
        let isExist = await fs.pathExists(targetPath)
        if (isExist) {
          let counter = 1
          let baseName = path.basename(targetPath, path.extname(targetPath))
          let extension = path.extname(targetPath)
          let directory = path.dirname(targetPath)
          let newFileName = `${baseName} (${counter})${extension}`
          while (await fs.pathExists(join(directory, newFileName))) {
            counter++
            newFileName = `${baseName} (${counter})${extension}`
          }
          if (formData.isDeleteSourceFile) {
            fs.move(item.path, join(directory, newFileName))
          } else {
            fs.copy(item.path, join(directory, newFileName))
          }
        } else {
          if (formData.isDeleteSourceFile) {
            fs.move(item.path, targetPath)
          } else {
            fs.copy(item.path, targetPath)
          }
        }
        processNum++
        mainWindow.webContents.send(
          'progressSet',
          formData.isDeleteSourceFile ? '移动曲目中' : '复制曲目中',
          processNum,
          toBeDealSongs.length
        )
      }
      if (formData.isDeleteSourceFile) {
        processNum = 0
        mainWindow.webContents.send('progressSet', '删除重复曲目中', processNum, delList.length)
        for (let item of delList) {
          fs.remove(item)
          processNum++
          mainWindow.webContents.send('progressSet', '删除重复曲目中', processNum, delList.length)
        }
      }
      if (formData.isPushSongFingerprintLibrary) {
        fs.outputJSON(
          join(__dirname, 'songFingerprint', 'songFingerprint.json'),
          songFingerprintList
        )
      }
    } else if (!formData.isComparisonSongFingerprint && formData.isPushSongFingerprintLibrary) {
      //不比对声音指纹，仅加入指纹库
      await analyseSongFingerprint()
      for (let item of fingerprintResults) {
        if (songFingerprintList.indexOf(item.md5_hash) == -1) {
          songFingerprintList.push(item.md5_hash)
        }
      }
      fs.outputJSON(join(__dirname, 'songFingerprint', 'songFingerprint.json'), songFingerprintList)
      await moveSong()
    }
    let contentArr = ['文件夹下共扫描' + songFileUrls.length + '首曲目']
    contentArr.push('歌单共导入' + importSongsCount + '首曲目')
    if (formData.isComparisonSongFingerprint) {
      contentArr.push('比对声音指纹去除' + delList.length + '首重复曲目')
    }
    if (formData.isPushSongFingerprintLibrary) {
      contentArr.push(
        '声音指纹库新增' + (songFingerprintList.length - songFingerprintListLengthBefore) + '首曲目'
      )
    }
    contentArr.push('声音指纹库现有' + songFingerprintList.length + '声音指纹')
    mainWindow.webContents.send('importFinished', contentArr)
    return
  })
}

ipcMain.handle('moveInDir', async (e, src, dest, isExist) => {
  const srcFullPath = join(__dirname, src)
  const destDir = join(__dirname, dest)
  const destFileName = path.basename(srcFullPath)
  const destFullPath = join(destDir, destFileName)
  if (isExist) {
    let oldJson = await fs.readJSON(join(destDir, 'description.json'))
    await updateTargetDirSubdirOrder(destDir, oldJson.order, 'before', 'plus')
    await fs.move(srcFullPath, destFullPath, { overwrite: true })
    let json = await fs.readJSON(join(destFullPath, 'description.json'))
    let originalOrder = json.order
    json.order = 1
    await fs.outputJSON(join(destFullPath, 'description.json'), json)
    const srcDir = path.dirname(srcFullPath)
    await updateTargetDirSubdirOrder(srcDir, originalOrder, 'after', 'minus')
  } else {
    await updateTargetDirSubdirOrder(destDir, 0, 'after', 'plus')
    await fs.move(srcFullPath, destFullPath, { overwrite: true })
    let json = await fs.readJSON(join(destFullPath, 'description.json'))
    let originalOrder = json.order
    json.order = 1
    await fs.outputJSON(join(destFullPath, 'description.json'), json)
    await updateTargetDirSubdirOrder(path.dirname(srcFullPath), originalOrder, 'after', 'minus')
  }
})

//todo测试音频播放可行性代码待删除-------------
// ipcMain.handle('aaa', async (e) => {
//   let mp3 = fs.readFileSync(join(__dirname, 'library/1.mp3'))
//   return mp3
// })

ipcMain.handle('scanSongList', async (e, songListPath) => {
  let scanPath = join(__dirname, songListPath)
  const mm = await import('music-metadata')
  let songInfoArr = []
  let songFileUrls = await collectFilesWithExtensions(scanPath, ['.mp3', '.wav', '.flac'])
  for (let url of songFileUrls) {
    let metadata = await mm.parseFile(url)
    let cover = mm.selectCover(metadata.common.picture)
    songInfoArr.push({
      uuid: uuidv4(),
      title: metadata.common.title,
      artist: metadata.common.artist,
      album: metadata.common.album,
      genre: metadata.common.genre,
      label: metadata.common.label,
      cover: cover
    })
  }
  return songInfoArr
})

ipcMain.handle('moveToDirSample', async (e, src, dest) => {
  const srcFullPath = join(__dirname, src)
  const destDir = join(__dirname, dest)
  const destFileName = path.basename(srcFullPath)
  const destFullPath = join(destDir, destFileName)
  await fs.move(srcFullPath, destFullPath)
})
ipcMain.handle('reOrderSubDir', async (e, targetPath, subDirArrJson) => {
  let subDirArr = JSON.parse(subDirArrJson)
  const promises = []
  const changeOrder = async (item) => {
    let jsonPath = join(__dirname, targetPath, item.dirName, 'description.json')
    let json = await fs.readJSON(jsonPath)
    if (json.order != item.order) {
      json.order = item.order
      await fs.outputJSON(jsonPath, json)
    }
  }
  for (let item of subDirArr) {
    promises.push(changeOrder(item))
  }
  await Promise.all(promises)
})

ipcMain.handle('getLibrary', async () => {
  const library = await getLibrary()
  return library
})

ipcMain.handle('renameDir', async (e, newName, dirPath) => {
  let descriptionPath = join(__dirname, join(dirPath, 'description.json'))
  let descriptionJson = await fs.readJSON(descriptionPath)
  descriptionJson.dirName = newName
  await fs.outputJson(descriptionPath, descriptionJson)
  await fs.rename(
    join(__dirname, dirPath),
    join(__dirname, dirPath.slice(0, dirPath.lastIndexOf('/') + 1) + newName)
  )
})
ipcMain.handle('updateOrderAfterNum', async (e, targetPath, order) => {
  await updateTargetDirSubdirOrder(join(__dirname, targetPath), order, 'after', 'minus')
})

ipcMain.handle('delDir', async (e, targetPath) => {
  await fs.remove(join(__dirname, targetPath))
})

ipcMain.handle('mkDir', async (e, descriptionJson, dirPath) => {
  await updateTargetDirSubdirOrder(join(__dirname, dirPath), 0, 'after', 'plus')
  let targetPath = join(__dirname, dirPath, descriptionJson.dirName)
  await fs.outputJson(join(targetPath, 'description.json'), descriptionJson)
})

ipcMain.handle('updateTargetDirSubdirOrderAdd', async (e, dirPath) => {
  await updateTargetDirSubdirOrder(join(__dirname, dirPath), 0, 'after', 'plus')
})

ipcMain.handle('select-folder', async (event, arg) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  if (result.canceled) {
    return null
  }
  return result.filePaths[0]
})
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

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

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
