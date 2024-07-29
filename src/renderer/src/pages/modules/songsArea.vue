<script setup>
import { watch, ref, nextTick, onUnmounted, computed } from 'vue'
import { useRuntimeStore } from '@renderer/stores/runtime'
import libraryUtils from '@renderer/utils/libraryUtils.js'
import { vDraggable } from 'vue-draggable-plus'
import songAreaColRightClickMenu from '@renderer/components/songAreaColRightClickMenu.vue'
import hotkeys from 'hotkeys-js';
let columnData = ref([])
if (localStorage.getItem('songColumnData')) {
  columnData.value = JSON.parse(localStorage.getItem('songColumnData'))
} else {
  columnData.value = [
    {
      columnName: '专辑封面',
      key: 'coverUrl',
      show: true,
      width: 100
    },
    {
      columnName: '曲目标题',
      key: 'title',
      show: true,
      width: 250
    },
    {
      columnName: '表演者',
      key: 'artist',
      show: true,
      width: 200
    },
    {
      columnName: '时长',
      key: 'duration',
      show: true,
      width: 100
    },
    {
      columnName: '专辑',
      key: 'album',
      show: true,
      width: 200
    },
    {
      columnName: '风格',
      key: 'genre',
      show: true,
      width: 200
    },
    {
      columnName: '唱片公司',
      key: 'label',
      show: true,
      width: 200
    },
    {
      columnName: '比特率',
      key: 'bitrate',
      show: true,
      width: 200
    },
    {
      columnName: '编码格式',
      key: 'container',
      show: true,
      width: 200
    }
  ]
}

const runtime = useRuntimeStore()
let songInfoArr = ref([])
let loadingShow = ref(false)

const openSongList = async () => {
  for (let item of songInfoArr.value) {
    if (item.coverUrl) {
      URL.revokeObjectURL(item.coverUrl)
    }
  }
  songInfoArr.value = []
  await nextTick(() => { })

  let songListPath = libraryUtils.findDirPathByUuid(
    runtime.libraryTree,
    runtime.selectedSongListUUID
  )
  loadingShow.value = false
  let loadingSetTimeout = setTimeout(() => {
    loadingShow.value = true
  }, 100)
  let { scanData, songListUUID } = await window.electron.ipcRenderer.invoke(
    'scanSongList',
    songListPath,
    runtime.selectedSongListUUID
  )
  clearTimeout(loadingSetTimeout)
  loadingShow.value = false
  if (songListUUID != runtime.selectedSongListUUID) {
    return
  }

  for (let item of scanData) {
    if (item.cover) {
      let blob = new Blob([Uint8Array.from(item.cover.data)], { type: item.cover.format })
      const blobUrl = URL.createObjectURL(blob)
      item.coverUrl = blobUrl
    }
  }
  songInfoArr.value = scanData
}
watch(
  () => runtime.selectedSongListUUID,
  async () => {
    selectedSongFilePath.value.length = 0
    await openSongList()
  }
)

window.electron.ipcRenderer.on('importFinished', async (event, contentArr, songListUUID) => {
  if (songListUUID == runtime.selectedSongListUUID) {
    setTimeout(async () => {
      await openSongList()
    }, 1000)
  }
})
function onUpdate() {
  localStorage.setItem('songColumnData', JSON.stringify(columnData.value))
}

let startX = 0
let resizingCol = null
let isResizing = false
let initWidth = 0
function startResize(e, col) {
  if (col.key === 'coverUrl') {
    return
  }
  e.preventDefault && e.preventDefault()
  isResizing = true
  startX = e.clientX
  resizingCol = col
  initWidth = col.width
  document.addEventListener('mousemove', resize)
  document.addEventListener('mouseup', stopResize)
}

function resize(e) {
  if (!isResizing) return
  const deltaX = e.clientX - startX
  const newWidth = Math.max(50, initWidth + deltaX) // 设置最小宽度
  resizingCol.width = newWidth
}

function stopResize() {
  isResizing = false
  document.removeEventListener('mousemove', resize)
  document.removeEventListener('mouseup', stopResize)
  onUpdate()
}



const colRightClickMenuShow = ref(false)
const colClickEvent = ref({})
const contextmenuEvent = (event) => {
  colClickEvent.value = event
  colRightClickMenuShow.value = true
}

const colMenuHandleClick = (item) => {
  for (let col of columnData.value) {
    if (col.key === item.key) {
      col.show = !col.show
      onUpdate()
      return
    }
  }
}
let columnDataArr = computed(() => {
  return columnData.value.filter((item) => item.show)
})
const selectedSongFilePath = ref([])
const songClick = (song) => {
  runtime.activeMenuUUID = ''
  selectedSongFilePath.value = [song.filePath]
}
const songContextmenu = (song) => {
  runtime.activeMenuUUID = ''
  //todo
}

const playingSongFilePath = ref('')

watch(
  () => runtime.playingData.playingSong,
  () => {
    playingSongFilePath.value = runtime.playingData.playingSong.filePath
  }
)
const songDblClick = (song) => {
  runtime.activeMenuUUID = ''
  playingSongFilePath.value = song.filePath
  selectedSongFilePath.value = []
  runtime.playingData.playingSong = song
  runtime.playingData.playingSongListData = songInfoArr.value
  window.electron.ipcRenderer.send('readSongFile', song.filePath)
}

hotkeys('ctrl+a, command+a', () => {
  selectedSongFilePath.value.length = 0
  for (let item of songInfoArr.value) {
    selectedSongFilePath.value.push(item.filePath)
  }
  return false
})
//todo ctrl单选 shift多选
window.electron.ipcRenderer.on('mainWindow-blur', async (event) => {
  console.log('mainWindow-blur')
  //todo
})
</script>
<template>
  <div v-show="loadingShow"
    style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: center">
    <div class="loading"></div>
  </div>
  <div style="height: 100%; width: 100%; overflow: auto" v-if="runtime.selectedSongListUUID && songInfoArr.length != 0"
    @click="selectedSongFilePath.length = 0">
    <div @contextmenu.stop="contextmenuEvent" class="songItem lightBackground" style="position: sticky; top: 0"
      v-draggable="[
        columnData,
        {
          animation: 150,
          direction: 'horizontal',
          onUpdate
        }
      ]">
      <div class="coverDiv lightBackground unselectable" v-for="col of columnDataArr" :key="col.key"
        :class="{ coverDiv: col.key == 'coverUrl', titleDiv: col.key != 'coverUrl' }"
        :style="'width:' + col.width + 'px'" style="
          border-right: 1px solid #000000;
          padding-left: 10px;
          box-sizing: border-box;
          display: flex;
        ">
        <div style="flex-grow: 1; overflow: hidden">
          <div style="width: 0; white-space: nowrap">{{ col.columnName }}</div>
        </div>
        <div v-if="col.key !== 'coverUrl'" style="width: 5px; cursor: e-resize" @mousedown="startResize($event, col)">
        </div>
      </div>
    </div>
    <div>
      <div v-for="(item, index) of songInfoArr" :key="item.filePath" class="songItem unselectable"
        @click.stop="songClick(item)" @contextmenu.stop="songContextmenu(item)" @dblclick.stop="songDblClick(item)">
        <div :class="{
          lightBackground: index % 2 === 1 && selectedSongFilePath.indexOf(item.filePath) === -1,
          darkBackground: index % 2 === 0 && selectedSongFilePath.indexOf(item.filePath) === -1,
          selectedSong: selectedSongFilePath.indexOf(item.filePath) !== -1,
          playingSong: item.filePath === playingSongFilePath
        }" style="display: flex">
          <template v-for="col of columnDataArr" :key="col.key">
            <template v-if="col.show">
              <div v-if="col.key == 'coverUrl'" class="coverDiv" style="overflow: hidden"
                :style="'width:' + col.width + 'px'">
                <img :src="item.coverUrl" class="unselectable" />
              </div>
              <div v-else class="titleDiv" :style="'width:' + col.width + 'px'">
                {{ item[col.key] }}
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
  <songAreaColRightClickMenu v-model="colRightClickMenuShow" :clickEvent="colClickEvent" :columnData="columnData"
    @colMenuHandleClick="colMenuHandleClick" />
</template>
<style lang="scss" scoped>
.selectedSong {
  background-color: #37373d;
}

.playingSong {
  color: #0078d4 !important;
  font-weight: bold;
}

.coverDiv {
  height: 29px;
  line-height: 30px;
  border-right: 1px solid #2b2b2b;
  border-bottom: 1px solid #2b2b2b;

  img {
    width: 100%;
  }
}

.titleDiv {
  height: 30px;
  line-height: 30px;
  padding-left: 10px;
  box-sizing: border-box;
  border-right: 1px solid #2b2b2b;
  white-space: nowrap;
  overflow: hidden;
}

.songItem {
  width: 0;
  height: 30px;
  display: flex;
  font-size: 14px;

  div {
    flex-shrink: 0;
  }
}

.lightBackground {
  background-color: #191919;
}

.darkBackground {
  background-color: #000000;
}

.loading {
  display: block;
  position: relative;
  width: 6px;
  height: 10px;

  animation: rectangle infinite 1s ease-in-out -0.2s;

  background-color: #cccccc;
}

.loading:before,
.loading:after {
  position: absolute;
  width: 6px;
  height: 10px;
  content: '';
  background-color: #cccccc;
}

.loading:before {
  left: -14px;

  animation: rectangle infinite 1s ease-in-out -0.4s;
}

.loading:after {
  right: -14px;

  animation: rectangle infinite 1s ease-in-out;
}

@keyframes rectangle {

  0%,
  80%,
  100% {
    height: 20px;
    box-shadow: 0 0 #cccccc;
  }

  40% {
    height: 30px;
    box-shadow: 0 -20px #cccccc;
  }
}
</style>