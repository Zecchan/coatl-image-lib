<template>
  <div style="max-width:1600px;margin:0 auto;padding:1.5rem 1.25rem">

    <!-- Search bar -->
    <div class="search-box">
      <div class="flex items-center gap-3">
        <Search :size="16" style="color:#484860;flex-shrink:0" />
        <input
          v-model="searchText"
          class="search-input flex-1"
          type="text"
          placeholder="Search… e.g.  roshutsu  title:Bokura  $1girl  -$blue_hair"
          @keydown.enter="doSearch"
        />
        <button class="btn-primary" @click="doSearch">Search</button>
        <button class="btn-secondary" @click="clearSearch">Clear</button>
        <select class="per-page-select" v-model="pageSize" @change="onPageSizeChange">
          <option :value="10">10 / page</option>
          <option :value="25">25 / page</option>
          <option :value="50">50 / page</option>
        </select>
        <button class="adv-toggle" :class="{ 'adv-active': hasFilters }" @click="advancedOpen = !advancedOpen">
          <SlidersHorizontal :size="13" />
          Filters
          <ChevronDown :size="12" :style="{ transform: advancedOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }" />
        </button>
      </div>
      <p style="margin:.6rem 0 0 1.6rem;font-size:.72rem;color:#404055">
        Plain text searches title / artist / series &nbsp;·&nbsp;
        <code>field:value</code> matches a specific field &nbsp;·&nbsp;
        <code>$tag</code> requires a tag &nbsp;·&nbsp;
        <code>-$tag</code> excludes a tag
      </p>

      <!-- Advanced filters panel -->
      <div v-show="advancedOpen" class="adv-panel">
        <!-- Media type -->
        <div class="adv-row">
          <span class="adv-label">Media type</span>
          <div class="adv-pills">
            <button
              v-for="mt in mediatypes" :key="mt.uid"
              class="mt-pill"
              :style="selectedMediatypeUids.includes(mt.uid)
                ? `background:${mt.color}22;border-color:${mt.color};color:${mt.color}`
                : ''"
              @click="toggleMediatype(mt.uid)"
            >
              <span class="mt-dot" :style="`background:${mt.color}`"></span>
              {{ mt.name }}
            </button>
          </div>
        </div>

        <!-- Max content rating -->
        <div class="adv-row">
          <span class="adv-label">Max rating</span>
          <div class="adv-pills">
            <button
              v-for="(r, i) in RATINGS" :key="r.key"
              class="rating-btn"
              :style="RATING_ORDER.indexOf(maxRating) >= i ? r.activeStyle : ''"
              @click="maxRating = r.key"
            >{{ r.label }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex justify-between items-center mb-4" style="font-size:.78rem;color:#555570">
      <span>{{ resultsLabel }}</span>
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

    <!-- Media grid -->
    <div v-if="medias.length" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem">
      <div v-for="m in medias" :key="m.uid" class="media-card" :style="m.mediatypeColor ? `border-color:${m.mediatypeColor}` : ''" @click="router.push(`/media/${m.uid}`)">
        <!-- Cover -->
        <div class="cover-wrap">
          <img
            v-if="coverSrc(m)"
            :src="coverSrc(m)"
            :alt="m.title"
            loading="lazy"
            class="cover-img"
          />
          <div v-else class="cover-placeholder">
            <Images :size="40" style="color:#252535" />
          </div>
          <!-- Content rating badge -->
          <span class="cr-badge" :class="`cr-${m.content_rating}`">{{ m.content_rating }}</span>
        </div>

        <!-- Info -->
        <div class="card-body">
          <div class="card-title" :title="m.title">{{ m.title }}</div>
          <div v-if="m.artist" class="card-sub" :title="m.artist">{{ m.artist }}</div>
          <!-- Quality score stars -->
          <div v-if="m.rating" class="card-stars">
            <span v-for="s in 5" :key="s" :style="s <= m.rating ? 'color:#f0c040' : 'color:#2a2a3a'">★</span>
          </div>
          <!-- Top 3 tags -->
          <div v-if="m.tags?.length" class="card-tags">
            <span
              v-for="t in m.tags.slice(0, 3)" :key="t.name"
              class="tag-chip"
              @click.stop="clickTag(t.name, $event)"
            >{{ t.name }}</span>
          </div>
        </div>
      </div>
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

    <!-- Empty state -->
    <div v-else-if="!medias.length" class="flex flex-col items-center" style="padding:5rem 1rem;text-align:center">
      <Images :size="60" style="color:#1c1c28;margin-bottom:1rem" />
      <p style="font-size:.95rem;font-weight:500;color:#555570;margin:0 0 .4rem">{{ emptyTitle }}</p>
      <p class="empty-msg" style="font-size:.82rem;color:#404055" v-html="emptyMsg"></p>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Images, SlidersHorizontal, ChevronDown } from 'lucide-vue-next'

const route  = useRoute()
const router = useRouter()

// ── Search / page state ───────────────────────────────────────────────────────
const searchText = ref('')
const medias     = ref([])
const total      = ref(0)
const page       = ref(1)
const pageSize   = ref(25)
const emptyTitle = ref('No media indexed yet')
const emptyMsg   = ref('Go to <a href="/admin">Administration</a> to index your image folders.')

// ── Advanced filter state (pending — only applied on Search) ──────────────────
const advancedOpen          = ref(false)
const mediatypes            = ref([])
const selectedMediatypeUids = ref([])
const maxRating             = ref('explicit')

const RATING_ORDER = ['general', 'sensitive', 'questionable', 'explicit']
const RATINGS = [
  { key: 'general',      label: 'General',      activeStyle: 'background:#1a3a1a;border-color:#6dcc6d;color:#6dcc6d' },
  { key: 'sensitive',    label: 'Sensitive',    activeStyle: 'background:#3a3010;border-color:#f0c040;color:#f0c040' },
  { key: 'questionable', label: 'Questionable', activeStyle: 'background:#3a1e00;border-color:#f08030;color:#f08030' },
  { key: 'explicit',     label: 'Explicit',     activeStyle: 'background:#3a0a0a;border-color:#e05050;color:#e05050' },
]

// hasFilters reflects the pending panel state (visual cue before searching)
const hasFilters = computed(() =>
  selectedMediatypeUids.value.length > 0 || maxRating.value !== 'explicit'
)

function toggleMediatype(uid) {
  const idx = selectedMediatypeUids.value.indexOf(uid)
  if (idx === -1) selectedMediatypeUids.value.push(uid)
  else selectedMediatypeUids.value.splice(idx, 1)
}

// ── Active query (what the backend is currently showing) ──────────────────────
// Captured from the form on Search click; page navigation reuses it.
const activeQuery = ref({ q: '', mediatypeUids: [], maxRating: 'explicit' })

const totalPages   = computed(() => Math.ceil(total.value / pageSize.value) || 1)

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
const resultsLabel = computed(() => {
  if (!total.value) return ''
  const start = (page.value - 1) * pageSize.value + 1
  const end   = Math.min(page.value * pageSize.value, total.value)
  return `${start}–${end} of ${total.value} entr${total.value !== 1 ? 'ies' : 'y'}`
})

// ── Data fetching ─────────────────────────────────────────────────────────────
async function runFetch() {
  const aq = activeQuery.value
  const p  = new URLSearchParams()
  if (aq.q)                        p.set('q', aq.q)
  if (aq.mediatypeUids.length)     p.set('mediatypeUids', aq.mediatypeUids.join(','))
  if (aq.maxRating !== 'explicit') p.set('maxRating', aq.maxRating)
  p.set('page',     page.value)
  p.set('pageSize', pageSize.value)

  try {
    const res  = await fetch(`/db/medias?${p}`)
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    medias.value = data.items
    total.value  = data.total
    if (!data.total) {
      emptyTitle.value = aq.q ? `No results for "${aq.q}"` : 'No media indexed yet'
      emptyMsg.value   = aq.q
        ? 'Try different search terms.'
        : 'Go to <a href="/admin">Administration</a> to index your image folders.'
    }
  } catch {
    medias.value = []
    total.value  = 0
    emptyTitle.value = 'Failed to load'
    emptyMsg.value   = 'Could not reach the server.'
  }
}

// Capture current form state, reset to page 1, fetch.
async function doSearch() {
  activeQuery.value = {
    q:             searchText.value.trim(),
    mediatypeUids: [...selectedMediatypeUids.value],
    maxRating:     maxRating.value,
  }
  page.value = 1
  await runFetch()
}

// Navigate to a specific page with the current active query.
async function goPage(n) {
  page.value = Math.max(1, Math.min(n, totalPages.value))
  await runFetch()
}

// Per-page change: reset to page 1 and refetch with current active query.
async function onPageSizeChange() {
  page.value = 1
  await runFetch()
}

function clearSearch() {
  searchText.value            = ''
  selectedMediatypeUids.value = []
  maxRating.value             = 'explicit'
  activeQuery.value           = { q: '', mediatypeUids: [], maxRating: 'explicit' }
  page.value                  = 1
  runFetch()
}

onMounted(async () => {
  try {
    const res = await fetch('/db/mediatypes')
    mediatypes.value = res.ok ? await res.json() : []
  } catch { mediatypes.value = [] }
  // If we were navigated here with ?q= (e.g. from tag click in MediaView), pre-fill and search
  if (route.query.q) {
    searchText.value = route.query.q
    await doSearch()
  } else {
    runFetch()
  }
})

function clickTag(name, e) {
  const token = `$${name}`
  if (e.shiftKey) {
    const cur = searchText.value.trimEnd()
    searchText.value = cur ? `${cur} ${token}` : token
  } else {
    searchText.value = token
  }
  doSearch()
}

// Resolve the correct src for a media cover:
// - HTTP/FTP URL  → use directly
// - absolute path → /scan/image?f=<path>  (server validates extension)
// - relative name → /scan/cover/:uid      (server joins sourcePath + mediaPath + cover)
// - empty         → null (placeholder shown)
function coverSrc(m) {
  if (!m.cover) return null
  if (/^(https?|ftp):\/\//i.test(m.cover)) return m.cover
  if (/^([a-zA-Z]:[/\\]|[/\\]{1})/.test(m.cover)) return `/scan/image?f=${encodeURIComponent(m.cover)}`
  return `/scan/cover/${m.uid}`
}
</script>

<style scoped>
.search-box {
  background: #181820;
  border: 1px solid #252535;
  border-radius: 12px;
  padding: 1.1rem 1.4rem;
  margin-bottom: 1.25rem;
}
.search-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid #252535;
  border-radius: 0;
  outline: none;
  color: #e0e0ee;
  font-size: .9rem;
  padding: .3rem 0;
  min-width: 0;
  transition: border-color .15s;
}
.search-input:focus        { border-bottom-color: #7c5cbf; }
.search-input::placeholder { color: #383848; }
code { background: #1e1e30; border-radius: 3px; padding: 0 .35em; font-size: .88em; color: #a0a0c8; }

/* Media card */
.media-card {
  background: #181820;
  border: 1px solid #252535;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: transform .15s, border-color .15s, box-shadow .15s;
}
.media-card:hover {
  transform: translateY(-3px);
  border-color: #7c5cbf;
  box-shadow: 0 6px 20px #7c5cbf22;
}

/* Cover */
.cover-wrap        { position: relative; width: 100%; aspect-ratio: 1 / 1; background: #101018; }
.cover-img         { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }

/* Content rating badge */
.cr-badge {
  position: absolute; bottom: .4rem; left: .4rem;
  font-size: .62rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  padding: .15em .55em; border-radius: 4px;
}
.cr-general      { background: #1a3a1a; color: #6dcc6d; }
.cr-sensitive    { background: #3a3010; color: #f0c040; }
.cr-questionable { background: #3a1e00; color: #f08030; }
.cr-explicit     { background: #3a0a0a; color: #e05050; }

/* Card body */
.card-body  { padding: .6rem .75rem .55rem; }
.card-title {
  font-size: .82rem; font-weight: 600; color: #d0d0e8;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: .15rem;
}
.card-sub {
  font-size: .72rem; color: #666680;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: .25rem;
}
.card-stars { font-size: .85rem; margin-bottom: .3rem; line-height: 1; }

/* Tags */
.card-tags { display: flex; flex-wrap: wrap; gap: .25rem; margin-top: .1rem; }
.tag-chip  {
  font-size: .62rem; background: #1e1e30; border: 1px solid #2a2a45;
  color: #8888aa; border-radius: 4px; padding: .1em .45em;
  cursor: pointer; transition: background .12s, color .12s;
}
.tag-chip:hover { background: #2a2a48; color: #b0b0cc; }

.empty-msg :deep(a)       { color: #7c5cbf; text-decoration: none; }
.empty-msg :deep(a:hover) { text-decoration: underline; }

/* Per-page dropdown */
.per-page-select {
  background: #181820; border: 1px solid #252535; border-radius: 6px;
  color: #a0a0c0; font-size: .78rem; padding: .28rem .55rem;
  outline: none; cursor: pointer;
}
.per-page-select:focus { border-color: #7c5cbf; }

/* Pagination */
.pagination { display: flex; align-items: center; gap: .3rem; flex-wrap: wrap; }
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

/* Advanced filters toggle */
.adv-toggle {
  display: inline-flex; align-items: center; gap: .35rem;
  background: #181820; border: 1px solid #252535; border-radius: 6px;
  color: #666680; font-size: .75rem; padding: .28rem .65rem;
  cursor: pointer; white-space: nowrap; flex-shrink: 0;
  transition: border-color .15s, color .15s;
}
.adv-toggle:hover  { border-color: #7c5cbf; color: #a0a0c0; }
.adv-active        { border-color: #7c5cbf !important; color: #b090f0 !important; }

/* Advanced panel */
.adv-panel {
  margin-top: .9rem;
  padding-top: .85rem;
  border-top: 1px solid #1e1e2e;
  display: flex; flex-direction: column; gap: .65rem;
}
.adv-row   { display: flex; align-items: center; gap: .75rem; flex-wrap: wrap; }
.adv-label { font-size: .72rem; color: #484860; min-width: 6rem; flex-shrink: 0; }
.adv-pills { display: flex; flex-wrap: wrap; gap: .4rem; }

/* Mediatype pill */
.mt-pill {
  display: inline-flex; align-items: center; gap: .35rem;
  background: #1a1a28; border: 1px solid #2a2a3e;
  color: #666680; font-size: .72rem; border-radius: 99px;
  padding: .2em .75em; cursor: pointer;
  transition: background .12s, border-color .12s, color .12s;
}
.mt-pill:hover { border-color: #444460; color: #9090b0; }
.mt-dot { width: .5rem; height: .5rem; border-radius: 50%; flex-shrink: 0; }

/* Content rating segment buttons */
.rating-btn {
  background: #1a1a28; border: 1px solid #2a2a3e;
  color: #555570; font-size: .72rem; border-radius: 6px;
  padding: .22em .8em; cursor: pointer;
  transition: background .12s, border-color .12s, color .12s;
}
.rating-btn:hover { border-color: #444460; color: #9090b0; }
</style>
