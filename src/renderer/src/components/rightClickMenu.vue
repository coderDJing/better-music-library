<script setup>
import { watch, ref } from 'vue';
import { useRuntimeStore } from '@renderer/stores/runtime'
import { v4 as uuidv4 } from 'uuid';
const uuid = uuidv4()
const runtime = useRuntimeStore()

const emits = defineEmits(['menuButtonClick', 'update:modelValue'])
watch(() => runtime.activeMenuUUID, (val) => {
  if (val !== uuid) {
    emits('update:modelValue', false)
  }
})
const props = defineProps({
  menuArr: {
    type: Array,
    required: true
  },
  modelValue: {
    type: Boolean,
    required: true
  },
  clickEvent: {
    type: Object,
    required: true
  }
})

watch(() => props.modelValue, () => {
  if (props.modelValue == true) {
    runtime.activeMenuUUID = uuid
  }
})
const menuButtonClick = (item) => {
  runtime.activeMenuUUID = ''
  emits('menuButtonClick', item, props.clickEvent)
}

let positionTop = ref(0)
let positionLeft = ref(0)
watch(() => props.clickEvent, () => {
  let windowWidth = window.innerWidth;
  let windowHeight = window.innerHeight;
  let clickX = props.clickEvent.clientX
  let clickY = props.clickEvent.clientY
  positionLeft.value = clickX
  positionTop.value = clickY

  let itemCount = 0
  for (let arr of props.menuArr) {
    itemCount = itemCount + arr.length
  }
  let divHeight = (props.menuArr.length * 10) + (itemCount * 28) + (props.menuArr.length - 1) + 5
  let divWidth = 255
  if ((clickY + divHeight) > windowHeight) {
    positionTop.value = clickY - (clickY + divHeight - windowHeight)
  }
  if ((clickX + divWidth) > windowWidth) {
    positionLeft.value = clickX - (clickX + divWidth - windowWidth)
  }
})


</script>
<template>
  <div v-if="props.modelValue" class="menu unselectable" :style="{ top: positionTop + 'px', left: positionLeft + 'px' }"
    @click.stop="() => { }">
    <div v-for="item of props.menuArr" class="menuGroup">
      <div v-for="button of item" class="menuButton" @click="menuButtonClick(button)"
        @contextmenu="menuButtonClick(button)">
        <span>{{ button.name }}</span>
        <span>{{ button.shortcutKey }}</span>
      </div>
    </div>
  </div>
</template>
<style lang="scss" scoped>
.menu {
  position: absolute;
  background-color: #1f1f1f;
  border: 1px solid #454545;
  font-size: 14px;
  width: 250px;
  border-radius: 5px;

  .menuGroup {
    border-bottom: 1px solid #454545;
    padding: 5px 5px;

    .menuButton {
      display: flex;
      justify-content: space-between;
      padding: 5px 20px;
      border-radius: 5px;

      &:hover {
        background-color: #0078d4;
        color: white;
      }
    }
  }

  .menuGroup:last-child {
    border-bottom: 0px;
  }

}
</style>
