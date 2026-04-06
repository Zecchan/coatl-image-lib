<template>
  <div>
    <!-- Toolbar -->
    <div class="ic-toolbar">
      <span class="ic-count" v-if="total">
        {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} of {{ total }} videos
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

    <!-- No thumbnails notice -->
    <div v-if="missingThumbs > 0 && !loading" class="notice-bar">
      <Film :size="14" />
      {{ missingThumbs }} video{{ missingThumbs === 1 ? '' : 's' }} missing thumbnails.
      Use <strong>Edit → Regenerate Thumbnails</strong> to generate them.
    </div>

    <!-- Loading -->
    <div v-if="loading" class="state-center" style="padding:4rem 0">
      <div class="spinner"></div>
    </div>

    <!-- Video grid -->
    <div v-else-if="videos.length" class="img-grid">
      <div
        v-for="vid in videos"
        :key="vid.rel"
        class="img-tile"
        @click="openPlayer(vid)"
      >
        <div class="thumb-wrap">
          <img
            v-if="vid.thumb"
            :src="thumbSrc(vid.rel)"
            :alt="vid.rel"
            loading="lazy"
            class="img-tile-img"
          />
          <div v-else class="thumb-placeholder">
            <Film :size="32" style="color:#333350" />
          </div>
          <div class="play-overlay"><Play :size="24" /></div>
        </div>
        <div class="img-tile-name" :title="vid.rel.split('/').pop()">{{ vid.rel.split('/').pop() }}</div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else class="state-center" style="padding:4rem 0;color:#555570;font-size:.85rem">
      No videos found in this folder.
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

    <!-- Video player dialog -->
    <VideoPlayer v-model="playerOpen" :src="playerSrc" :title="playerTitle" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Film, Play } from 'lucide-vue-next'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps({
  media: { type: Object, required: true },
})

const videos   = ref([])
const total    = ref(0)
const page     = ref(1)
const pageSize = ref(48)
const loading  = ref(false)

const totalPages   = computed(() => Math.ceil(total.value / pageSize.value) || 1)
const missingThumbs = computed(() => videos.value.filter(v => !v.thumb).length)

const pageNumbers = computed(() => {
  const tot = totalPages.value
  const cur = page.value
  if (tot <= 7) return Array.from({ length: tot }, (_, i) => i + 1)
  const pages = new Set([1, 2, tot - 1, tot])
  for (let d = -2; d <= 2; d++) {
    const p = cur + d
    if (p > 0 && p <= tot) pages.add(p)
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

const playerOpen  = ref(false)
const playerSrc   = ref('')
const playerTitle = ref('')

function videoSrc(rel) {
  const encoded = rel.split('/').map(encodeURIComponent).join('/')
  return `/scan/video/${props.media.uid}/${encoded}`
}

function openPlayer(vid) {
  playerSrc.value   = videoSrc(vid.rel)
  playerTitle.value = vid.rel.split('/').pop()
  playerOpen.value  = true
}

function thumbSrc(rel) {
  // rel is like "subdir/video.mkv" → thumbnail is "thumbnails/subdir/video.jpg"
  const parts = rel.split('/')
  const base  = parts[parts.length - 1].replace(/\.[^.]+$/, '') + '.jpg'
  const thumbRel = [...parts.slice(0, -1), base].join('/')
  const encoded = thumbRel.split('/').map(encodeURIComponent).join('/')
  return `/scan/video-thumb/${props.media.uid}/${encoded}`
}

async function fetchVideos() {
  loading.value = true
  try {
    const p = new URLSearchParams({ page: page.value, pageSize: pageSize.value })
    const res = await fetch(`/scan/videos/${props.media.uid}?${p}`)
    if (!res.ok) { videos.value = []; total.value = 0; return }
    const data = await res.json()
    videos.value = data.items
    total.value  = data.total
  } catch {
    videos.value = []; total.value = 0
  } finally {
    loading.value = false
  }
}

function goPage(n) {
  page.value = Math.max(1, Math.min(n, totalPages.value))
  fetchVideos()
}

function onPageSizeChange() {
  page.value = 1
  fetchVideos()
}

onMounted(fetchVideos)
</script>

<style scoped>
.ic-toolbar {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
  gap: .5rem; margin-bottom: 1rem;
}
.ic-count        { font-size: .78rem; color: #555570; }
.ic-toolbar-right { display: flex; align-items: center; gap: .75rem; }

.notice-bar {
  display: flex; align-items: center; gap: .5rem;
  font-size: .78rem; color: #a08840;
  background: #1e1a08; border: 1px solid #2e2810; border-radius: 6px;
  padding: .45rem .75rem; margin-bottom: .75rem;
}

/* Video grid */
.img-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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

.thumb-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  background: #080810;
  overflow: hidden;
}
.img-tile-img {
  width: 100%; height: 100%; object-fit: cover; display: block;
}
.thumb-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
.play-overlay {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.7);
  background: rgba(0,0,0,0);
  transition: background .15s;
  pointer-events: none;
}
.img-tile:hover .play-overlay { background: rgba(0,0,0,0.35); }

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

.state-center { display: flex; justify-content: center; }
.spinner {
  width: 2rem; height: 2rem; border-radius: 50%;
  border: 3px solid #252535; border-top-color: #7c5cbf;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
