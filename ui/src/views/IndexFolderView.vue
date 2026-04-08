<template>
  <div style="max-width:960px;margin:0 auto;padding:2.5rem 1.25rem">

    <!-- Heading -->
    <div class="page-heading">
      <div class="flex items-center gap-2">
        <button class="back-btn" title="Back to Administration" @click="$router.push('/admin')">
          <ChevronLeft :size="15" />
        </button>
        <FolderOpen :size="17" style="color:#555570" />
        <span>Add Media</span>
      </div>
    </div>

    <!-- Controls -->
    <div class="controls-card">
      <div class="controls-row">

        <div class="field-group">
          <label class="field-label">Media Source</label>
          <select v-model="selectedSourceUid" class="field source-select">
            <option value="">— select —</option>
            <option v-for="s in sources" :key="s.uid" :value="s.uid">{{ s.name }}</option>
          </select>
        </div>

        <div class="field-group path-group">
          <label class="field-label">Path</label>
          <input v-model="scanPath" type="text" class="field" placeholder="e.g. D:\Photos\Anime" />
        </div>

        <button class="btn-primary load-btn" :disabled="!scanPath.trim() || loading" @click="load">
          <RotateCw v-if="loading" :size="14" class="spin" />
          <Search v-else :size="14" />
          {{ loading ? 'Scanning…' : 'Load' }}
        </button>

        <button class="btn-save load-btn" :disabled="!saveEnabled" @click="openSave">
          <Save :size="14" /> Save
        </button>

      </div>
      <div v-if="error" class="error-msg">{{ error }}</div>
    </div>

    <!-- Results -->
    <template v-if="result">
      <p class="results-meta">
        Found <strong>{{ result.total }}</strong>
        {{ result.isDocument ? 'document' : result.isAudio ? 'audio file' : result.isVideo ? 'video' : 'image' }}{{ result.total === 1 ? '' : 's' }} in
        <code>{{ result.dir }}</code>
        <span v-if="!result.isAudio && !result.isDocument && result.total > 12"> — showing {{ result.samples.length }} samples</span>
      </p>

      <!-- Audio file list -->
      <div v-if="result.isAudio && result.samples.length" class="audio-file-list">
        <div v-for="f in result.samples" :key="f.name" class="audio-file-row">
          <span class="audio-file-name">{{ f.name }}</span>
        </div>
        <div v-if="result.total > result.samples.length" class="audio-file-more">
          … and {{ result.total - result.samples.length }} more
        </div>
      </div>

      <!-- Document file list -->
      <div v-else-if="result.isDocument && result.samples.length" class="audio-file-list">
        <div v-for="f in result.samples" :key="f.name" class="audio-file-row">
          <span class="audio-file-name">{{ f.name }}</span>
        </div>
        <div v-if="result.total > result.samples.length" class="audio-file-more">
          … and {{ result.total - result.samples.length }} more
        </div>
      </div>

      <!-- Image/video grid -->
      <div v-else-if="!result.isAudio && !result.isDocument && result.samples.length" class="preview-grid">
        <div v-for="(img, i) in result.samples" :key="img.abs" class="preview-item">
          <div class="preview-img-wrap">
            <img :src="imgUrl(img.abs)" :alt="img.name" class="preview-img" loading="lazy" />
            <span v-if="i === 0" class="first-badge">first</span>
          </div>
          <span class="preview-name" :title="img.name">{{ img.name }}</span>
        </div>
      </div>

      <p v-else class="empty-hint">No {{ result.isDocument ? 'documents' : result.isAudio ? 'audio files' : result.isVideo ? 'videos' : 'images' }} found in that path.</p>

      <!-- Tagging analysis (images/video only) -->
      <div v-if="!result.isAudio && !result.isDocument && tagging" class="analysis-card" style="margin-top:1.25rem">
        <div style="display:flex;align-items:center;gap:.5rem;color:#555570;font-size:.82rem">
          <RotateCw :size="13" class="spin" />
          Analyzing {{ taggingCount }} samples with WD14…
        </div>
      </div>

      <div v-else-if="tagResult" class="analysis-card" style="margin-top:1.25rem">
        <button class="analysis-header" @click="tagExpanded = !tagExpanded">
          <span class="section-label" style="margin:0">Analysis Results</span>
          <ChevronDown :size="14" :style="{ transform: tagExpanded ? 'rotate(180deg)' : '', transition: 'transform .2s', color: '#444458' }" />
        </button>

        <div v-show="tagExpanded">
        <div class="section-label" style="margin-top:.85rem">Content Rating <span class="section-sub">(avg across samples)</span></div>
        <div class="ratings-row">
          <div v-for="(val, key) in tagResult.ratings" :key="key" class="rating-pill" :class="'rating-'+key">
            <span class="rating-key">{{ key }}</span>
            <span class="rating-pct">{{ (val * 100).toFixed(1) }}%</span>
          </div>
        </div>

        <div class="section-label" style="margin-top:1rem">Top Tags <span class="section-sub">(avg score, distinct across samples)</span></div>
        <div class="tags-wrap">
          <span v-for="t in tagResult.topTags" :key="t.tag" class="tag-chip">
            {{ t.tag }}<em>{{ (t.score * 100).toFixed(0) }}%</em>
          </span>
        </div>

        <template v-if="tagResult.topChars.length">
          <div class="section-label" style="margin-top:.75rem">Characters</div>
          <div class="tags-wrap">
            <span v-for="t in tagResult.topChars" :key="t.tag" class="tag-chip char-chip">
              {{ t.tag }}<em>{{ (t.score * 100).toFixed(0) }}%</em>
            </span>
          </div>
        </template>
        </div>
      </div>

      <!-- Full retag button: shown after sample tagging if 12 < total <= 100 and not yet done -->
      <div v-if="tagResult && !fullTagDone && result.allFiles?.length" style="margin-top:.75rem">
        <button class="btn-secondary" :disabled="tagging" @click="runFullTagging" style="font-size:.82rem">
          <RotateCw v-if="tagging" :size="13" class="spin" style="margin-right:.35rem" />
          {{ tagging ? 'Re-analyzing…' : `Retag with all ${result.total} files` }}
        </button>
      </div>
    </template>

    <!-- Save modal -->
    <div v-if="saveModal.open" class="modal-backdrop">
      <div class="save-modal">
        <div class="save-modal-header">
          <span style="font-size:.9rem;font-weight:600;color:#d0d0e0">Save Media Entry</span>
          <button class="icon-close" :disabled="saveModal.saving" @click="saveModal.saving || (saveModal.open = false)">✕</button>
        </div>
        <div class="save-modal-body">
          <MediaEntryForm :form="saveModal.form" :mediatypeType="selectedSourceType" :show-path="true" @cover-file="f => saveModal.coverFile = f" />
          <div v-if="saveModal.error" class="error-msg" style="margin-top:.75rem">{{ saveModal.error }}</div>
        </div>

        <div class="save-modal-footer">
          <label class="move-content-check">
            <input type="checkbox" v-model="saveModal.moveContent" :disabled="saveModal.saving" />
            Move content
          </label>
          <button class="btn-secondary" :disabled="saveModal.saving" @click="saveModal.saving || (saveModal.open = false, saveModal.coverFile = null)">Cancel</button>
          <button class="btn-primary" :disabled="saveModal.saving" @click="doSave">
            {{ saveModal.saving ? 'Saving…' : 'Save Entry' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue'
import { ChevronLeft, ChevronDown, FolderOpen, Search, RotateCw, Save } from 'lucide-vue-next'
import { API_BASE } from '../api.js'
import { MEDIA_TYPE_IMAGE_COLLECTION, MEDIA_TYPE_VIDEO_COLLECTION, MEDIA_TYPE_MUSIC_COLLECTION, MEDIA_TYPE_DOCUMENT_COLLECTION } from '../mediatypeEnum.js'
import MediaEntryForm from '../components/MediaEntryForm.vue'

const sources           = ref([])
const selectedSourceUid = ref('')
const scanPath          = ref('')
const loadedDir         = ref('')   // the dir that was actually scanned
const loading           = ref(false)
const error             = ref('')
const result            = ref(null)
const tagging           = ref(false)
const taggingCount      = ref(0)
const tagResult         = ref(null)
const tagExpanded       = ref(true)
const fullTagDone       = ref(false)

const saveEnabled = computed(() =>
  !!result.value &&
  !!selectedSourceUid.value &&
  scanPath.value.trim() === loadedDir.value &&
  !loading.value && !tagging.value
)

const saveModal = reactive({
  open: false, saving: false, error: '', moveContent: true,
  coverFile: null,
  form: defaultForm(),
})

// The mediatypeType of the currently selected source (used to show relevant sections)
const selectedSourceType = computed(() => {
  const s = sources.value.find(s => s.uid === selectedSourceUid.value)
  return s?.mediatypeType ?? null
})

function defaultForm() {
  return {
    path: '', cover: '', title: '', original_title: '', artist: '', series: '',
    content_rating: 'general', rating: null, language: '',
    page_count: null, source_url: '',
    developer: '', publisher: '', release_date: '', platform: '',
    duration: null, track_count: null,
    summary: '', notes: '',
    tags: [],
  }
}

// Parse "[Artist] Title" or plain title from folder name
function parseFolderName(name) {
  const m = name.match(/^\[([^\]]+)\]\s*(.+)$/)
  if (m) return { artist: m[1].trim(), title: m[2].trim() }
  return { artist: '', title: name }
}

async function loadSources() {
  try {
    const res = await fetch('/db/mediasources')
    sources.value = res.ok ? await res.json() : []
  } catch {
    sources.value = []
  }
}

function imgUrl(absPath) {
  return `/scan/image?f=${encodeURIComponent(absPath)}`
}

async function load() {
  scanPath.value = scanPath.value.trim().replace(/^"(.*)"$/, '$1')
  const dir = scanPath.value
  if (!dir) return
  loading.value  = true
  error.value    = ''
  result.value   = null
  tagResult.value = null
  fullTagDone.value = false
  try {
    const res  = await fetch('/scan/preview', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ dir, mediatypeType: selectedSourceType.value }),
    })
    const data = await res.json()
    if (!res.ok) { error.value = data.error || 'Scan failed.'; return }
    result.value = data
    loadedDir.value = scanPath.value.trim()
    // Skip WD14 tagging for non-image types
    if (data.samples.length && !data.isAudio && !data.isDocument) runTagging(data.samples)
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function runTagging(samples) {
  tagging.value   = true
  taggingCount.value = samples.length
  tagResult.value = null
  try {
    const results = []
    for (const img of samples) {
      try {
        const r = await fetch(`${API_BASE}/tag`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ image_path: img.abs }),
        })
        results.push(await r.json())
      } catch {
        // skip failed image, continue with the rest
      }
    }
    if (!results.length) return

    // Aggregate general tags
    const genMap  = new Map()
    const charMap = new Map()
    const ratingAccum = {}
    for (const r of results) {
      for (const t of r.general  ?? []) {
        const arr = genMap.get(t.tag) ?? []; arr.push(t.score); genMap.set(t.tag, arr)
      }
      for (const t of r.characters ?? []) {
        const arr = charMap.get(t.tag) ?? []; arr.push(t.score); charMap.set(t.tag, arr)
      }
      for (const [k, v] of Object.entries(r.ratings ?? {})) {
        ratingAccum[k] = (ratingAccum[k] ?? 0) + v
      }
    }
    const avg      = map => [...map.entries()]
      .map(([tag, scores]) => ({ tag, score: scores.reduce((a,b)=>a+b,0)/scores.length }))
      .sort((a,b) => b.score - a.score)
    const avgRatings = Object.fromEntries(
      Object.entries(ratingAccum).map(([k, v]) => [k, v / results.length])
    )
    tagResult.value = {
      ratings:  avgRatings,
      topTags:  avg(genMap).slice(0, 60),
      topChars: avg(charMap),
    }
    tagExpanded.value = true
  } finally {
    tagging.value = false
    // Clean up video preview temp dir (fire-and-forget)
    const tempDir = result.value?.tempDir
    if (tempDir) {
      fetch('/scan/preview-temp', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempDir }),
      }).catch(() => {})
    }
  }
}

async function runFullTagging() {
  const allFiles = result.value?.allFiles ?? []
  if (!allFiles.length) return
  await runTagging(allFiles)
  fullTagDone.value = true
}

function openSave() {
  const dir = result.value?.dir ?? ''
  // Compute relative path: strip source root prefix if source is selected
  const source = sources.value.find(s => s.uid === selectedSourceUid.value)
  let relPath = dir
  if (source?.path) {
    const root = source.path.replace(/[\\/]+$/, '')
    if (dir.toLowerCase().startsWith(root.toLowerCase())) {
      relPath = dir.slice(root.length).replace(/^[\\/]+/, '')
    }
  }
  const folderName = dir.split(/[\\/]/).filter(Boolean).pop() ?? ''
  const { artist, title } = parseFolderName(folderName)

  // Dominant content rating
  const dominantRating = tagResult.value
    ? Object.entries(tagResult.value.ratings).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'general'
    : 'general'

  // Cover: video → auto-generated; music/document → blank (user may optionally upload); image → first sample
  const cover = selectedSourceType.value === MEDIA_TYPE_VIDEO_COLLECTION
    ? 'cover.jpg'
    : (selectedSourceType.value === MEDIA_TYPE_MUSIC_COLLECTION || selectedSourceType.value === MEDIA_TYPE_DOCUMENT_COLLECTION)
      ? ''
      : (result.value?.samples?.[0]?.name ?? '')

  // Pre-fill tags from analysis (top 40)
  const tags = [
    ...(tagResult.value?.topTags  ?? []).slice(0, 35),
    ...(tagResult.value?.topChars ?? []),
  ].slice(0, 40)

  // Page count: prefill with total image count for image collections
  const page_count = selectedSourceType.value === MEDIA_TYPE_IMAGE_COLLECTION
    ? (result.value?.total ?? null)
    : null
  const track_count = (selectedSourceType.value === MEDIA_TYPE_VIDEO_COLLECTION || selectedSourceType.value === MEDIA_TYPE_MUSIC_COLLECTION || selectedSourceType.value === MEDIA_TYPE_DOCUMENT_COLLECTION)
    ? (result.value?.total ?? null)
    : null

  Object.assign(saveModal.form, defaultForm(), {
    path: relPath, cover, title, artist, content_rating: dominantRating, tags, page_count, track_count,
  })
  saveModal.error   = ''
  saveModal.saving  = false
  saveModal.open    = true
}

async function doSave() {
  if (!saveModal.form.title.trim()) { saveModal.error = 'Title is required.'; return }
  if ((selectedSourceType.value === MEDIA_TYPE_IMAGE_COLLECTION || selectedSourceType.value === MEDIA_TYPE_VIDEO_COLLECTION) && !saveModal.form.artist?.trim() && !saveModal.form.series?.trim()) {
    saveModal.error = `Artist or Circle/Series is required for ${selectedSourceType.value === MEDIA_TYPE_IMAGE_COLLECTION ? 'Image' : 'Video'} Collection.`; return
  }
  saveModal.saving = true
  saveModal.error  = ''
  try {
    const payload = {
      mediasourceUid: selectedSourceUid.value,
      scanDir: result.value.dir,
      form: saveModal.form,
      moveContent: saveModal.moveContent,
    }
    const res  = await fetch('/scan/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) { saveModal.error = data.error || 'Save failed.'; return }

    // If user chose a cover image (music create), upload it now
    if (saveModal.coverFile) {
      try {
        const uploadRes = await fetch(`/db/medias/${data.uid}/cover`, {
          method: 'POST',
          headers: { 'Content-Type': saveModal.coverFile.type || 'application/octet-stream' },
          body: saveModal.coverFile,
        })
        if (!uploadRes.ok) console.warn('[cover] upload failed:', uploadRes.status)
      } catch (e) {
        console.warn('[cover] upload error:', e.message)
      }
    }

    saveModal.open  = false
    saveModal.coverFile = null
    // Reset scan state — folder has moved, old path is no longer valid
    result.value    = null
    tagResult.value = null
    loadedDir.value = ''
    scanPath.value  = ''
  } catch (e) {
    saveModal.error = e.message
  } finally {
    saveModal.saving = false
  }
}

onMounted(loadSources)
</script>

<style scoped>
.page-heading {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 1.5rem;
  color: #555570; font-size: .95rem; font-weight: 400;
}
.back-btn {
  background: transparent; border: 1px solid #252535; border-radius: 6px;
  color: #555570; width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: border-color .15s, color .15s;
}
.back-btn:hover { border-color: #444458; color: #d0d0e0; }

.controls-card {
  background: #181820; border: 1px solid #252535; border-radius: 12px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
}
.controls-row {
  display: flex; align-items: flex-end; gap: .75rem; flex-wrap: wrap;
}
.field-group { display: flex; flex-direction: column; gap: .3rem; }
.source-select { min-width: 180px; }
.path-group { flex: 1; min-width: 220px; }
.load-btn {
  white-space: nowrap;
  display: flex; align-items: center; gap: .4rem;
  align-self: flex-end;
}
.btn-save {
  white-space: nowrap;
  display: flex; align-items: center; gap: .4rem;
  align-self: flex-end;
  background: #1a2e1a; border: 1px solid #34d39944; color: #34d399;
  border-radius: 8px; padding: .45rem .9rem; font-size: .8rem; cursor: pointer;
  transition: background .15s, border-color .15s;
}
.btn-save:hover:not(:disabled) { background: #1e381e; border-color: #34d399; }
.btn-save:disabled { opacity: .35; cursor: not-allowed; }
.error-msg { color: #f87171; font-size: .8rem; margin-top: .75rem; }

.results-meta {
  font-size: .8rem; color: #555570; margin: 0 0 1rem;
}
.results-meta strong { color: #d0d0e0; }
.results-meta code {
  font-family: monospace; font-size: .75rem; color: #888899;
  background: #1e1e2a; padding: 1px 5px; border-radius: 3px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: .75rem;
}
.preview-item {
  background: #181820; border: 1px solid #252535; border-radius: 8px;
  overflow: hidden; display: flex; flex-direction: column;
}
.preview-img-wrap { position: relative; }
.preview-img {
  width: 100%; aspect-ratio: 1; object-fit: cover; display: block;
  background: #111118;
}
.first-badge {
  position: absolute; top: 4px; left: 4px;
  font-size: .58rem; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
  background: #60a5fa22; color: #60a5fa; border: 1px solid #60a5fa44;
  border-radius: 3px; padding: 1px 5px;
}
.preview-name {
  font-size: .62rem; color: #444458; padding: .3rem .4rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-top: 1px solid #1e1e2a;
}

.empty-hint { text-align: center; padding: 3rem 1rem; font-size: .85rem; color: #404055; }

.audio-file-list {
  background: #0e0e18; border: 1px solid #1e1e2e; border-radius: 8px;
  max-height: 320px; overflow-y: auto; margin-bottom: 1rem;
}
.audio-file-row {
  padding: .4rem .9rem; border-bottom: 1px solid #111118;
  font-size: .8rem; color: #9090b0; font-family: monospace;
}
.audio-file-row:last-child { border-bottom: none; }
.audio-file-name { word-break: break-all; }
.audio-file-more {
  padding: .4rem .9rem; font-size: .75rem; color: #555570; font-style: italic;
}

.analysis-card {
  background: #181820; border: 1px solid #252535; border-radius: 12px;
  padding: 1.25rem 1.5rem;
}
.analysis-header {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; background: none; border: none; cursor: pointer; padding: 0;
}
.section-label {
  font-size: .72rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  color: #444458; margin-bottom: .6rem;
}
.section-sub { font-weight: 400; text-transform: none; letter-spacing: 0; color: #333346; }

.ratings-row { display: flex; gap: .5rem; flex-wrap: wrap; }
.rating-pill {
  display: flex; align-items: center; gap: .35rem;
  border-radius: 6px; padding: .25rem .6rem;
  font-size: .75rem; border: 1px solid;
}
.rating-general      { color: #34d399; border-color: #34d39933; background: #34d39910; }
.rating-sensitive    { color: #fbbf24; border-color: #fbbf2433; background: #fbbf2410; }
.rating-questionable { color: #f97316; border-color: #f9731633; background: #f9731610; }
.rating-explicit     { color: #f87171; border-color: #f8717133; background: #f8717110; }
.rating-key { text-transform: capitalize; }
.rating-pct { font-weight: 600; }

.tags-wrap { display: flex; flex-wrap: wrap; gap: .35rem; }
.tag-chip {
  display: inline-flex; align-items: center; gap: .3rem;
  background: #1e1e2a; border: 1px solid #252535; border-radius: 4px;
  padding: 2px 7px; font-size: .72rem; color: #888899;
}
.tag-chip em { font-style: normal; color: #444458; font-size: .68rem; }
.char-chip { border-color: #a78bfa33; color: #a78bfa; }
.char-chip em { color: #7c5cbf; }
.tag-rm { background: none; cursor: pointer; }
.tag-rm:hover { border-color: #f8717144; color: #f87171; }

/* Save modal */
.modal-backdrop {
  position: fixed; inset: 0; background: #00000099;
  display: flex; align-items: center; justify-content: center; z-index: 300;
}
.save-modal {
  background: #131318; border: 1px solid #252535; border-radius: 14px;
  width: min(860px, 96vw); max-height: 90vh;
  display: flex; flex-direction: column;
}
.save-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.5rem; border-bottom: 1px solid #1e1e2a;
}
.icon-close {
  background: none; border: none; color: #444458; font-size: 1rem; cursor: pointer;
  line-height: 1;
}
.icon-close:hover { color: #d0d0e0; }
.save-modal-body {
  flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem;
}
.save-modal-footer {
  display: flex; justify-content: flex-end; align-items: center; gap: .6rem;
  padding: 1rem 1.5rem; border-top: 1px solid #1e1e2a;
}
.move-content-check {
  display: flex; align-items: center; gap: .4rem;
  font-size: .82rem; color: #a0a0b8; cursor: pointer;
  margin-right: auto; user-select: none;
}
.move-content-check input[type=checkbox] { cursor: pointer; accent-color: #7c7cff; }
.modal-section-label {
  font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  color: #333346; margin-bottom: .5rem; display: flex; align-items: center; gap: .5rem;
}
.modal-row { display: flex; gap: .75rem; flex-wrap: wrap; }
.flex-1 { flex: 1; min-width: 0; }
.req { color: #f87171; }

.stars-row { display: flex; align-items: center; gap: .2rem; }
.star-btn {
  background: none; border: none; font-size: 1.6rem; cursor: pointer;
  color: #2a2a3a; line-height: 1; padding: 0 .05rem;
  transition: color .1s;
}
.star-btn.active { color: #fbbf24; }
.star-btn:hover  { color: #fbbf2488; }
.star-label { font-size: .78rem; color: #444458; margin-left: .5rem; }

.tag-add-row { display: flex; gap: .5rem; margin-top: .35rem; align-items: center; }
.tag-add-input { flex: 1; max-width: 260px; }
.tag-add-btn { padding: .35rem .75rem; font-size: .78rem; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin .8s linear infinite; }
</style>
