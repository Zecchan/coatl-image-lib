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
        <div v-if="totalPages > 1" class="flex items-center gap-2">
          <button class="page-btn" :disabled="page <= 1" @click="goPage(page - 1)">&lsaquo;</button>
          <span class="page-label">{{ page }} / {{ totalPages }}</span>
          <button class="page-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">&rsaquo;</button>
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
    <div v-if="totalPages > 1" class="flex justify-center items-center gap-2 mt-6" style="font-size:.78rem;color:#555570">
      <button class="page-btn" :disabled="page <= 1" @click="goPage(page - 1)">&lsaquo;</button>
      <span class="page-label">{{ page }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="page >= totalPages" @click="goPage(page + 1)">&rsaquo;</button>
    </div>

    <!-- Fullscreen viewer -->
    <ImageViewer v-model="viewerOpen" :src="viewerSrc" :alt="viewerAlt" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
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

// Viewer
const viewerOpen = ref(false)
const viewerSrc  = ref('')
const viewerAlt  = ref('')

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
  const img    = images.value[idx]
  viewerSrc.value  = imgSrc(img.rel)
  viewerAlt.value  = img.rel.split('/').pop()
  viewerOpen.value = true
}

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
.img-tile-img  { width: 100%; aspect-ratio: 1/1; object-fit: cover; display: block; }
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
  color: #a0a0c0; font-size: 1rem; width: 1.8rem; height: 1.8rem;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .12s, border-color .12s;
}
.page-btn:hover:not(:disabled) { background: #222232; border-color: #7c5cbf; color: #e0e0ee; }
.page-btn:disabled { opacity: .35; cursor: default; }
.page-label { font-size: .78rem; color: #777790; }

.state-center { display: flex; justify-content: center; }
.spinner {
  width: 2rem; height: 2rem; border-radius: 50%;
  border: 3px solid #252535; border-top-color: #7c5cbf;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
