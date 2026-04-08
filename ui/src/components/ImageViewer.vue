<template>
  <!-- Backdrop -->
  <Teleport to="body">
    <div v-if="modelValue" class="viewer-backdrop">
      <!-- Close button -->
      <button class="viewer-close" @click="close"><X :size="20" /></button>

      <!-- Image container -->
      <div
        ref="containerRef"
        class="viewer-container"
        @wheel.prevent="onWheel"
        @mousedown="onMouseDown"
      >
        <img
          ref="imgRef"
          :src="src"
          :alt="alt"
          class="viewer-img"
          :style="imgStyle"
          draggable="false"
          @load="onImgLoad"
        />
      </div>

      <!-- Zoom indicator -->
      <div class="viewer-zoom-label">{{ Math.round(scale * 100) }}%</div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  src:        { type: String,  default: '' },
  alt:        { type: String,  default: '' },
})
const emit = defineEmits(['update:modelValue'])

// ── State ─────────────────────────────────────────────────────────────────────
const scale        = ref(1)
const translateX   = ref(0)
const translateY   = ref(0)
const isDragging   = ref(false)
const dragStart    = ref({ x: 0, y: 0, tx: 0, ty: 0 })
const containerRef = ref(null)
const imgRef       = ref(null)
const imgVisible   = ref(false)

const MIN_SCALE = 0.5
const MAX_SCALE = 8

// ── Reset when opening / src changes ─────────────────────────────────────────
watch(() => props.modelValue, v => { if (v) { reset(); imgVisible.value = false } })
watch(() => props.src,        ()  => { if (props.modelValue) imgVisible.value = false })

function reset() {
  scale.value      = 1
  translateX.value = 0
  translateY.value = 0
}

function fitToContainer() {
  const img       = imgRef.value
  const container = containerRef.value
  if (!img || !container) return
  const W = img.naturalWidth
  const H = img.naturalHeight
  if (!W || !H) return
  const cW = container.clientWidth
  const cH = container.clientHeight
  const fitScale = Math.min(cW / W, cH / H, 1)
  scale.value      = fitScale
  // Re-center: with transformOrigin '0 0', flexbox already centers the natural-size image.
  // After scaling by fitScale the image shifts toward origin; compensate to keep it centered.
  translateX.value = (W / 2) * (1 - fitScale)
  translateY.value = (H / 2) * (1 - fitScale)
  imgVisible.value = true
}

function onImgLoad() { fitToContainer() }

// ── Computed transform ────────────────────────────────────────────────────────
const imgStyle = computed(() => ({
  transform:       `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value})`,
  transformOrigin: '0 0',
  cursor:          isDragging.value ? 'grabbing' : 'grab',
  opacity:         imgVisible.value ? 1 : 0,
}))

// ── Zoom on scroll ────────────────────────────────────────────────────────────
function onWheel(e) {
  const container = containerRef.value
  const img       = imgRef.value
  if (!container || !img) return

  const cRect = container.getBoundingClientRect()
  const iRect = img.getBoundingClientRect()

  // Mouse position in container space
  const mouseX = e.clientX - cRect.left
  const mouseY = e.clientY - cRect.top

  // Actual top-left of the image in container space (includes flexbox offset + current translate)
  const imgX = iRect.left - cRect.left
  const imgY = iRect.top  - cRect.top

  const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  const newScale   = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * zoomFactor))
  const ratio      = newScale / scale.value

  // The image point under the mouse must stay at the same container position after zoom.
  // New image top-left = mouseX - (mouseX - imgX) * ratio
  const newImgX = mouseX - (mouseX - imgX) * ratio
  const newImgY = mouseY - (mouseY - imgY) * ratio

  // translateX is the offset on top of the natural flexbox-centered position.
  // naturalX = imgX - translateX  =>  newTranslateX = newImgX - naturalX
  translateX.value = newImgX - (imgX - translateX.value)
  translateY.value = newImgY - (imgY - translateY.value)
  scale.value      = newScale
}

// ── Drag to pan ───────────────────────────────────────────────────────────────
function onMouseDown(e) {
  if (e.button !== 0) return
  const isBackground = e.target === containerRef.value
  let moved = false

  isDragging.value = true
  dragStart.value  = { x: e.clientX, y: e.clientY, tx: translateX.value, ty: translateY.value }

  const onMove = ev => {
    if (!isDragging.value) return
    const dx = ev.clientX - dragStart.value.x
    const dy = ev.clientY - dragStart.value.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true
    translateX.value = dragStart.value.tx + dx
    translateY.value = dragStart.value.ty + dy
  }
  const onUp = () => {
    isDragging.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup',   onUp)
    // Close only if the user clicked (no drag) on the backdrop background
    if (isBackground && !moved) close()
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup',   onUp)
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
function close() { emit('update:modelValue', false) }
</script>

<style scoped>
.viewer-backdrop {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(42, 42, 53, 0.88);
  display: flex; align-items: center; justify-content: center;
}

.viewer-close {
  position: absolute; top: 1rem; right: 1rem; z-index: 1;
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15);
  color: #e0e0ee; border-radius: 50%; width: 2.2rem; height: 2.2rem;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s;
}
.viewer-close:hover { background: rgba(255,255,255,.18); }

.viewer-container {
  position: absolute; inset: 0;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}

.viewer-img {
  /* Natural size; transform handles scale + translate */
  max-width: none;
  max-height: none;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
  transition: none;
  background: transparent;
}

.viewer-zoom-label {
  position: absolute; bottom: 1rem; left: 50%; transform: translateX(-50%);
  background: rgba(0,0,0,.55); color: #a0a0c0;
  font-size: .72rem; border-radius: 99px; padding: .2em .8em;
  pointer-events: none;
}
</style>
