<template>
  <Teleport to="body">
    <div v-if="modelValue" class="player-backdrop" @mousedown.self="close">
      <!-- Close -->
      <button class="player-close" @click="close"><X :size="20" /></button>

      <!-- Dialog -->
      <div class="player-dialog">
        <!-- Title bar -->
        <div class="player-title">{{ title }}</div>
        <!-- Video -->
        <video
          ref="videoEl"
          class="player-video"
          controls
          autoplay
          :src="src"
          @keydown.esc.prevent="close"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  src:        { type: String,  default: '' },
  title:      { type: String,  default: '' },
})
const emit = defineEmits(['update:modelValue'])

const videoEl = ref(null)

// Pause and clear source when dialog is closed so the browser stops buffering
watch(() => props.modelValue, async (open) => {
  if (!open) {
    if (videoEl.value) {
      videoEl.value.pause()
      videoEl.value.removeAttribute('src')
      videoEl.value.load()
    }
  } else {
    await nextTick()
    videoEl.value?.focus()
  }
})

function close() { emit('update:modelValue', false) }

// Global Escape key handler
function onKeyDown(e) { if (e.key === 'Escape') close() }
watch(() => props.modelValue, open => {
  if (open) window.addEventListener('keydown', onKeyDown)
  else       window.removeEventListener('keydown', onKeyDown)
}, { immediate: true })
</script>

<style scoped>
.player-backdrop {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(8, 8, 16, 0.92);
  display: flex; align-items: center; justify-content: center;
  padding: 1.5rem;
}

.player-close {
  position: absolute; top: 1rem; right: 1rem; z-index: 1;
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15);
  color: #e0e0ee; border-radius: 50%; width: 2.2rem; height: 2.2rem;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s;
}
.player-close:hover { background: rgba(255,255,255,.2); }

.player-dialog {
  display: flex; flex-direction: column;
  width: min(960px, 100%);
  max-height: calc(100vh - 3rem);
  background: #0d0d14;
  border: 1px solid #252535;
  border-radius: 10px;
  overflow: hidden;
}

.player-title {
  padding: .55rem 1rem;
  font-size: .78rem; color: #666680;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-bottom: 1px solid #1a1a28;
  flex-shrink: 0;
}

.player-video {
  width: 100%;
  max-height: calc(100vh - 7rem);
  background: #000;
  display: block;
  outline: none;
}
</style>
