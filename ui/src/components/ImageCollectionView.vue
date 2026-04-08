<template>
  <div>
    <!-- Toolbar -->
    <div class="ic-toolbar">
      <span class="ic-count" v-if="total">
        {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} of {{ total }} images
      </span>
      <div class="ic-toolbar-right">
        <select class="per-page-select" v-model="pageSize" @change="onPageSizeChange">
          <option :value="24">24 / page</option>
          <option :value="48">48 / page</option>
          <option :value="96">96 / page</option>
        </select>
        <div v-if="totalPages > 1" class="pagination">
          <button class="page-btn" title="First" :disabled="page <= 1" @click="goPage(1)">&laquo;</button>
          <button class="page-btn" title="Previous" :disabled="page <= 1" @click="goPage(page - 1)">&lsaquo;</button>
          <template v-for="(item, i) in pageNumbers" :key="i">
            <span v-if="item === '...'" class="page-ellipsis">&hellip;</span>
            <button v-else class="page-btn page-num" :class="{ active: item === page }" @click="goPage(item)">{{ item }}</button>
          </template>
          <button class="page-btn" title="Next" :disabled="page >= totalPages" @click="goPage(page + 1)">&rsaquo;</button>
          <button class="page-btn" title="Last" :disabled="page >= totalPages" @click="goPage(totalPages)">&raquo;</button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="state-center" style="padding:4rem 0">
      <div class="spinner"></div>
    </div>

    <!-- Image grid -->
    <div v-else-if="images.length" class="img-grid">
      <div
        v-for="(img, idx) in images" :key="img.rel"
        class="img-tile"
        @click="openViewer(idx)"
      >
        <img
          :src="imgSrc(img.rel)"
          :alt="img.rel"
          loading="lazy"
          class="img-tile-img"
        />
        <div class="img-tile-name">{{ img.rel.split('/').pop() }}</div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="state-center" style="padding:4rem 0;color:#555570;font-size:.85rem">
      No images found in this folder.
    </div>

    <!-- Bottom pagination -->
    <div v-if="totalPages > 1" class="pagination" style="margin-top:1.5rem;justify-content:center">
      <button class="page-btn" title="First" :disabled="page <= 1" @click="goPage(1)">&laquo;</button>
      <button class="page-btn" title="Previous" :disabled="page <= 1" @click="goPage(page - 1)">&lsaquo;</button>
      <template v-for="(item, i) in pageNumbers" :key="i">
        <span v-if="item === '...'" class="page-ellipsis">&hellip;</span>
        <button v-else class="page-btn page-num" :class="{ active: item === page }" @click="goPage(item)">{{ item }}</button>
      </template>
      <button class="page-btn" title="Next" :disabled="page >= totalPages" @click="goPage(page + 1)">&rsaquo;</button>
      <button class="page-btn" title="Last" :disabled="page >= totalPages" @click="goPage(totalPages)">&raquo;</button>
    </div>

    <!-- Fullscreen viewer -->
    <ImageViewer v-model="viewerOpen" :src="viewerSrc" :alt="viewerAlt" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import ImageViewer from './ImageViewer.vue'

const props = defineProps({
  media: { type: Object, required: true },
})

const images   = ref([])
const total    = ref(0)
const page     = ref(1)
const pageSize = ref(48)
const loading  = ref(false)

const totalPages = computed(() => Math.ceil(total.value / pageSize.value) || 1)

// Builds the page-number list with ellipsis gaps.
// Returns an array of numbers or the string '...' (ellipsis sentinel).
const pageNumbers = computed(() => {
  const total = totalPages.value
  const cur   = page.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, 2, total - 1, total])
  for (let d = -2; d <= 2; d++) {
    const p = cur + d
    if (p > 0 && p <= total) pages.add(p)
  }
  const sorted = [...pages].sort((a, b) => a - b)
  const result = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) result.push('...')
    result.push(p)
    prev = p
  }
  return result
})

// Viewer
const viewerOpen = ref(false)
const viewerSrc  = ref('')
const viewerAlt  = ref('')
const viewerIdx  = ref(0)

function imgSrc(rel) {
  // rel is a forward-slash path like "001.jpg" or "sub/001.jpg"
  // Encode each segment individually to preserve path separators
  const encoded = rel.split('/').map(encodeURIComponent).join('/')
  return `/scan/file/${props.media.uid}/${encoded}`
}

async function fetchImages() {
  loading.value = true
  try {
    const p = new URLSearchParams({ page: page.value, pageSize: pageSize.value })
    const res = await fetch(`/scan/images/${props.media.uid}?${p}`)
    if (!res.ok) { images.value = []; total.value = 0; return }
    const data = await res.json()
    images.value = data.items
    total.value  = data.total
  } catch {
    images.value = []; total.value = 0
  } finally {
    loading.value = false
  }
}

function goPage(n) {
  page.value = Math.max(1, Math.min(n, totalPages.value))
  fetchImages()
}

function onPageSizeChange() {
  page.value = 1
  fetchImages()
}

function openViewer(idx) {
  viewerIdx.value  = idx
  const img        = images.value[idx]
  viewerSrc.value  = imgSrc(img.rel)
  viewerAlt.value  = img.rel.split('/').pop()
  viewerOpen.value = true
}

async function navigateViewer(delta) {
  const next = viewerIdx.value + delta
  if (next >= 0 && next < images.value.length) {
    viewerIdx.value = next
    const img       = images.value[next]
    viewerSrc.value = imgSrc(img.rel)
    viewerAlt.value = img.rel.split('/').pop()
  } else if (delta < 0 && page.value > 1) {
    page.value--
    await fetchImages()
    const idx       = images.value.length - 1
    viewerIdx.value = idx
    const img       = images.value[idx]
    viewerSrc.value = imgSrc(img.rel)
    viewerAlt.value = img.rel.split('/').pop()
  } else if (delta > 0 && page.value < totalPages.value) {
    page.value++
    await fetchImages()
    viewerIdx.value = 0
    const img       = images.value[0]
    viewerSrc.value = imgSrc(img.rel)
    viewerAlt.value = img.rel.split('/').pop()
  }
}

function onViewerKey(e) {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    navigateViewer(-1)
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    navigateViewer(1)
  }
}

watch(viewerOpen, v => {
  if (v) window.addEventListener('keydown', onViewerKey)
  else   window.removeEventListener('keydown', onViewerKey)
})

onUnmounted(() => window.removeEventListener('keydown', onViewerKey))

onMounted(fetchImages)
</script>

<style scoped>
.ic-toolbar {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
  gap: .5rem; margin-bottom: 1rem;
}
.ic-count        { font-size: .78rem; color: #555570; }
.ic-toolbar-right { display: flex; align-items: center; gap: .75rem; }

/* Image grid */
.img-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: .6rem;
}
.img-tile {
  background: #0d0d14;
  border: 1px solid #1a1a28;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color .15s, transform .15s;
}
.img-tile:hover { border-color: #7c5cbf; transform: translateY(-2px); }
.img-tile-img  { width: 100%; aspect-ratio: 1/1; object-fit: contain; display: block; }
.img-tile-name {
  padding: .3rem .45rem;
  font-size: .6rem; color: #444460;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Shared pagination / per-page */
.per-page-select {
  background: #181820; border: 1px solid #252535; border-radius: 6px;
  color: #a0a0c0; font-size: .78rem; padding: .28rem .55rem; outline: none; cursor: pointer;
}
.per-page-select:focus { border-color: #7c5cbf; }
.page-btn {
  background: #181820; border: 1px solid #252535; border-radius: 6px;
  color: #a0a0c0; font-size: .85rem; width: 1.9rem; height: 1.9rem;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .12s, border-color .12s;
}
.page-btn:hover:not(:disabled) { background: #222232; border-color: #7c5cbf; color: #e0e0ee; }
.page-btn:disabled { opacity: .35; cursor: default; }
.page-num.active { background: #2a1e4a; border-color: #7c5cbf; color: #c0a0ff; font-weight: 600; }
.page-ellipsis { color: #444460; font-size: .82rem; padding: 0 .1rem; line-height: 1.9rem; }
.pagination { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; }
.page-label { font-size: .78rem; color: #777790; }

.state-center { display: flex; justify-content: center; }
.spinner {
  width: 2rem; height: 2rem; border-radius: 50%;
  border: 3px solid #252535; border-top-color: #7c5cbf;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
