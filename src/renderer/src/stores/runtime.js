import { defineStore } from 'pinia'

export const useRuntimeStore = defineStore('runtime', {
  state: () => {
    return {
      platform:'',//使用平台//暂时没用
      isWindowMaximized: null,
      libraryAreaSelected: 'listLibrary',
      activeMenuUUID: '',
      layoutConfig: {
        libraryAreaWidth: 200,
        isMaxMainWin: false, //上次关闭前是否最大化
        scanNewSongDialog: {
          isDeleteSourceFile: true, //是否删除源文件
          isDeleteSourceDir: true, //是否删除文件夹，暂时注释，无法判断文件夹是否是桌面等重要文件夹
          isComparisonSongFingerprint: true, //比对声音指纹去重
          isPushSongFingerprintLibrary: true //是否加入声音指纹库
        },
        mainWindowWidth: 900, //上次关闭前窗口化时的宽
        mainWindowHeight: 600 //上次关闭前窗口化时的高
      },
      dragItemData: null,
      libraryTree: {},
      selectSongListDialogShow: false,
      dialogSelectedSongListUUID: '', //dialog中被选中的歌单UUID
      selectedSongListUUID: '', //被选中的歌单UUID
      importingSongListUUID: '', //正在执行导入中的歌单
      isProgressing: false, //正在执行某计算或IO任务
      playingData: {
        //播放器相关
        playingSong: {}, //正在播放的歌曲
        playingSongListData: [] //正在播放的歌单的曲目数组
      }
    }
  }
})
