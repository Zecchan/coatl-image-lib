<template>
  <div class="media-header">
    <!-- Cover + meta side by side -->
    <div class="header-layout">
      <!-- Cover -->
      <div class="cover-col">
        <div class="cover-wrap">
          <img v-if="coverUrl" :src="coverUrl" :alt="media.title" class="cover-img" />
          <div v-else class="cover-placeholder"><ImageOff :size="48" style="color:#252535" /></div>
          <span class="cr-badge" :class="`cr-${media.content_rating}`">{{ media.content_rating }}</span>
        </div>
      </div>

      <!-- Text meta -->
      <div class="meta-col">
        <div class="type-row">
          <div class="type-badge" :style="media.mediatypeColor ? `border-color:${media.mediatypeColor};color:${media.mediatypeColor}` : ''">
            {{ media.mediatypeName }}
          </div>
          <button class="edit-btn" title="Edit" @click="openEdit">
            <Pencil :size="13" />
            Edit
          </button>
        </div>

        <h1 class="title">{{ media.title }}</h1>
        <p v-if="media.original_title" class="original-title">{{ media.original_title }}</p>

        <div class="meta-grid">
          <!-- Type 1: Image Collection -->
          <template v-if="media.mediatypeType === 1">
            <span class="meta-key">Artist</span>
            <span class="meta-val">{{ media.artist || '—' }}</span>
            <span class="meta-key">Circle / Series</span>
            <span class="meta-val">{{ media.series || '—' }}</span>
            <span class="meta-key">Pages</span>
            <span class="meta-val">{{ media.page_count || '—' }}</span>
            <span class="meta-key">Language</span>
            <span class="meta-val">{{ media.language || '—' }}</span>
            <span class="meta-key">Source</span>
            <span class="meta-val">
              <a v-if="media.source_url" :href="media.source_url" target="_blank" rel="noopener" class="link">{{ media.source_url }}</a>
              <span v-else>—</span>
            </span>
          </template>

          <!-- Type 2: Video Collection -->
          <template v-else-if="media.mediatypeType === 2">
            <span class="meta-key">Artist</span>
            <span class="meta-val">{{ media.artist || '—' }}</span>
            <span class="meta-key">Series</span>
            <span class="meta-val">{{ media.series || '—' }}</span>
            <span class="meta-key">Videos</span>
            <span class="meta-val">{{ media.track_count || '—' }}</span>
            <span class="meta-key">Language</span>
            <span class="meta-val">{{ media.language || '—' }}</span>
            <span class="meta-key">Source</span>
            <span class="meta-val">
              <a v-if="media.source_url" :href="media.source_url" target="_blank" rel="noopener" class="link">{{ media.source_url }}</a>
              <span v-else>—</span>
            </span>
          </template>

          <!-- Type 3: Music Collection -->
          <template v-else-if="media.mediatypeType === 3">
            <span class="meta-key">Artist</span>
            <span class="meta-val">{{ media.artist || '—' }}</span>
            <span class="meta-key">Series</span>
            <span class="meta-val">{{ media.series || '—' }}</span>
            <span class="meta-key">Duration</span>
            <span class="meta-val">{{ media.duration || '—' }}</span>
            <span class="meta-key">Tracks</span>
            <span class="meta-val">{{ media.track_count || '—' }}</span>
            <span class="meta-key">Language</span>
            <span class="meta-val">{{ media.language || '—' }}</span>
          </template>

          <!-- Fallback: show any non-empty field -->
          <template v-else>
            <template v-if="media.artist">
              <span class="meta-key">Artist</span><span class="meta-val">{{ media.artist }}</span>
            </template>
            <template v-if="media.series">
              <span class="meta-key">Series</span><span class="meta-val">{{ media.series }}</span>
            </template>
            <template v-if="media.language">
              <span class="meta-key">Language</span><span class="meta-val">{{ media.language }}</span>
            </template>
          </template>

          <!-- Always shown -->
          <span class="meta-key">Library</span>
          <span class="meta-val">{{ media.mediasourceName }}</span>
          <template v-if="fullPath">
            <span class="meta-key">Path</span>
            <span class="meta-val path-row">
              <span class="path-text" :title="fullPath">{{ fullPath }}</span>
              <button class="path-open-btn" title="Copy path" @click="copyPath">
                <Copy :size="13" />
              </button>
              <button class="path-open-btn" title="Open in Explorer" @click="openExplorer">
                <FolderOpen :size="13" />
              </button>
            </span>
          </template>
          <span class="meta-key">Added</span>
          <span class="meta-val">{{ formatDate(media.created_at) }}</span>
          <span class="meta-key">Embedded</span>
          <span class="meta-val" :style="media.qdrant_indexed_at ? '' : 'color:#555570'">
            {{ media.qdrant_indexed_at ? formatDate(media.qdrant_indexed_at) : 'Not indexed' }}
          </span>
        </div>

        <!-- Stars -->
        <div v-if="media.rating" class="stars">
          <span v-for="s in 5" :key="s" :style="s <= media.rating ? 'color:#f0c040' : 'color:#2a2a3a'">★</span>
        </div>

        <!-- Tags -->
        <div v-if="media.tags?.length" class="tags-row">
          <span
            v-for="t in media.tags" :key="t.name"
            class="tag-chip"
            @click="$emit('tag-click', t.name, $event)"
          >
            {{ t.name }}
            <em v-if="t.score" class="tag-score">{{ Math.round(t.score * 100) }}%</em>
          </span>
        </div>

        <!-- Collapsible: Summary -->
        <details v-if="media.summary" class="collapsible">
          <summary class="collapsible-toggle">Summary</summary>
          <p class="collapsible-body">{{ media.summary }}</p>
        </details>

        <!-- Collapsible: Notes -->
        <details v-if="media.notes" class="collapsible">
          <summary class="collapsible-toggle">Notes</summary>
          <p class="collapsible-body">{{ media.notes }}</p>
        </details>
      </div>
    </div>
  </div>

  <!-- Edit modal -->
  <Teleport to="body">
    <div v-if="editModal.open" class="modal-backdrop">
      <div class="edit-modal">
        <div class="modal-header">
          <span style="font-size:.9rem;font-weight:600;color:#d0d0e0">Edit Media Entry</span>
          <button class="icon-close" :disabled="editModal.saving" @click="editModal.saving || (editModal.open = false)">✕</button>
        </div>
        <div class="modal-body">
          <MediaEntryForm :form="editModal.form" :mediatypeType="media.mediatypeType" :show-path="false" @cover-file="f => coverFile = f" />
          <div v-if="editModal.error" class="error-msg" style="margin-top:.75rem">{{ editModal.error }}</div>
        </div>
        <div class="modal-footer">
          <label v-if="media.mediatypeType === 1 || media.mediatypeType === 2" class="reembed-check">
            <input type="checkbox" v-model="editModal.reembed" :disabled="editModal.saving" />
            {{ media.mediatypeType === 2 ? 'Re-embed videos' : 'Re-embed images' }}
          </label>
          <label v-if="media.mediatypeType === 2" class="reembed-check">
            <input type="checkbox" v-model="editModal.regenThumbs" :disabled="editModal.saving" />
            Regenerate thumbnails
          </label>
          <button class="btn-secondary" :disabled="editModal.saving" @click="editModal.saving || (editModal.open = false, coverFile = null)">Cancel</button>
          <button class="btn-primary" :disabled="editModal.saving" @click="doEdit">
            {{ editModal.saving ? 'Saving…' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ImageOff, Pencil, FolderOpen, Copy } from 'lucide-vue-next'
import MediaEntryForm from './MediaEntryForm.vue'

const props = defineProps({
  media: { type: Object, required: true },
})
const emit = defineEmits(['tag-click', 'updated'])

const coverUrl = computed(() => {
  const m = props.media
  if (!m.cover) return null
  if (/^(https?|ftp):\/\//i.test(m.cover)) return m.cover
  if (/^([a-zA-Z]:[/\\]|[/\\])/.test(m.cover)) return `/scan/image?f=${encodeURIComponent(m.cover)}`
  return `/scan/cover/${m.uid}`
})

const fullPath = computed(() => {
  const m = props.media
  if (!m.mediasourcePath || !m.path) return null
  return (m.mediasourcePath.replace(/[\/\\]+$/, '') + '\\' + m.path.replace(/^[\/\\]+/, '')).replace(/\//g, '\\')
})

async function copyPath() {
  if (!fullPath.value) return
  await navigator.clipboard.writeText(fullPath.value)
}

async function openExplorer() {
  if (!fullPath.value) return
  await fetch('/scan/open-explorer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: fullPath.value }),
  })
}

function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ─── Edit modal ──────────────────────────────────────────────────────────────
let coverFile = null  // File object set when user picks a new cover in video edit mode

const editModal = reactive({
  open: false, saving: false, error: '', reembed: false, regenThumbs: false,
  form: {
    cover: '', title: '', original_title: '', artist: '', series: '',
    content_rating: 'general', rating: null, language: '',
    page_count: null, source_url: '',
    developer: '', publisher: '', release_date: '', platform: '',
    duration: null, track_count: null,
    summary: '', notes: '', tags: [],
  },
})

function openEdit() {
  const m = props.media
  Object.assign(editModal.form, {
    cover: m.cover || '',
    title: m.title || '',
    original_title: m.original_title || '',
    artist: m.artist || '',
    series: m.series || '',
    content_rating: m.content_rating || 'general',
    rating: m.rating || null,
    language: m.language || '',
    page_count: m.page_count || null,
    source_url: m.source_url || '',
    developer: m.developer || '',
    publisher: m.publisher || '',
    release_date: m.release_date || '',
    platform: m.platform || '',
    duration: m.duration || null,
    track_count: m.track_count || null,
    summary: m.summary || '',
    notes: m.notes || '',
    tags: (m.tags || []).map(t => ({ tag: t.name, score: t.score ?? 0 })),
  })
  editModal.error = ''
  editModal.reembed = false
  editModal.regenThumbs = false
  coverFile = null
  editModal.open = true
}

async function doEdit() {
  if (!editModal.form.title.trim()) { editModal.error = 'Title is required.'; return }
  editModal.saving = true
  editModal.error = ''
  try {
    // If a new cover file was chosen (video edit), upload it first
    if (coverFile) {
      const uploadRes = await fetch(`/db/medias/${props.media.uid}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': coverFile.type || 'application/octet-stream' },
        body: coverFile,
      })
      if (!uploadRes.ok) {
        const d = await uploadRes.json().catch(() => ({}))
        editModal.error = d.error || 'Cover upload failed.'
        return
      }
      editModal.form.cover = 'cover.jpg'
      coverFile = null
    }

    const res = await fetch(`/db/medias/${props.media.uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editModal.form),
    })
    const data = await res.json()
    if (!res.ok) { editModal.error = data.error || 'Save failed.'; return }
    editModal.open = false
    emit('updated', data)
    if (editModal.reembed) {
      // Fire-and-forget re-embedding in the background
      fetch(`/db/medias/${props.media.uid}/reindex`, { method: 'POST' }).catch(() => {})
    }
    if (editModal.regenThumbs) {
      // Fire-and-forget thumbnail regeneration (force=true overwrites existing)
      fetch(`/scan/thumbnails/${props.media.uid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      }).catch(() => {})
    }
  } catch (e) {
    editModal.error = e.message
  } finally {
    editModal.saving = false
  }
}
</script>

<style scoped>
.media-header {
  background: #13131c;
  border: 1px solid #1e1e30;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.header-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

/* Cover */
.cover-col { flex-shrink: 0; }
.cover-wrap {
  position: relative;
  width: 180px;
  aspect-ratio: 2 / 3;
  background: #0d0d14;
  border-radius: 8px;
  overflow: hidden;
}
.cover-img         { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.cr-badge {
  position: absolute; bottom: .4rem; left: .4rem;
  font-size: .6rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  padding: .15em .5em; border-radius: 4px;
}
.cr-general      { background: #1a3a1a; color: #6dcc6d; }
.cr-sensitive    { background: #3a3010; color: #f0c040; }
.cr-questionable { background: #3a1e00; color: #f08030; }
.cr-explicit     { background: #3a0a0a; color: #e05050; }

/* Meta */
.meta-col    { flex: 1; min-width: 0; }
.type-row    { display: flex; align-items: center; justify-content: space-between; margin-bottom: .6rem; }
.type-badge  {
  display: inline-block; font-size: .65rem; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; border: 1px solid #333; color: #666;
  border-radius: 4px; padding: .15em .6em;
}
.edit-btn {
  display: inline-flex; align-items: center; gap: .3rem;
  background: none; border: 1px solid #252535; color: #555570;
  border-radius: 6px; padding: .25rem .6rem;
  font-size: .72rem; cursor: pointer; transition: border-color .12s, color .12s;
}
.edit-btn:hover { border-color: #7c5cbf; color: #a080d8; }
.title          { font-size: 1.4rem; font-weight: 700; color: #e8e8f8; margin: 0 0 .2rem; line-height: 1.25; }
.original-title { font-size: .82rem; color: #555570; margin: 0 0 .75rem; }

.meta-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: .2rem .75rem;
  font-size: .8rem;
  margin-bottom: .75rem;
}
.meta-key { color: #484860; font-weight: 600; }
.meta-val { color: #9090b0; }
.link { color: #7c5cbf; text-decoration: none; }
.link:hover { text-decoration: underline; }
.path-row { display: flex; align-items: center; gap: .4rem; min-width: 0; }
.path-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .78rem; font-family: monospace; color: #7070a0; }
.path-open-btn {
  background: none; border: none; cursor: pointer; padding: 2px 4px;
  color: #555570; border-radius: 4px; display: inline-flex; align-items: center;
  flex-shrink: 0; transition: color .15s;
}
.path-open-btn:hover { color: #9b72cf; }

.stars       { font-size: 1.1rem; margin-bottom: .6rem; line-height: 1; }

.tags-row    { display: flex; flex-wrap: wrap; gap: .3rem; margin-bottom: .6rem; }
.tag-chip    {
  display: inline-flex; align-items: center; gap: .3em;
  font-size: .67rem; background: #1a1a2a; border: 1px solid #252540;
  color: #7a7a9a; border-radius: 4px; padding: .15em .5em;
  cursor: pointer; transition: background .12s, color .12s;
}
.tag-chip:hover { background: #222235; color: #a0a0c0; }
.tag-score  { font-style: normal; color: #404058; font-size: .6rem; }

.collapsible { margin-top: .5rem; border: 1px solid #1e1e30; border-radius: 6px; overflow: hidden; }
.collapsible-toggle {
  list-style: none;
  display: flex; align-items: center; gap: .4rem;
  font-size: .75rem; font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
  color: #484860; padding: .45rem .75rem;
  cursor: pointer; user-select: none;
  background: #0f0f1a;
}
.collapsible-toggle::before { content: '▶'; font-size: .55rem; transition: transform .15s; }
details[open] > .collapsible-toggle::before { transform: rotate(90deg); }
.collapsible-toggle::-webkit-details-marker { display: none; }
.collapsible-body {
  font-size: .82rem; color: #7070a0; line-height: 1.6;
  margin: 0; padding: .6rem .75rem;
  white-space: pre-wrap;
}

@media (max-width: 600px) {
  .header-layout { flex-direction: column; }
  .cover-wrap    { width: 100%; aspect-ratio: 16 / 9; }
}

/* Edit modal */
.modal-backdrop {
  position: fixed; inset: 0; background: #00000099;
  display: flex; align-items: center; justify-content: center; z-index: 400;
}
.edit-modal {
  background: #131318; border: 1px solid #252535; border-radius: 14px;
  width: min(860px, 96vw); max-height: 90vh;
  display: flex; flex-direction: column;
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.5rem; border-bottom: 1px solid #1e1e2a;
}
.modal-body {
  flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem;
}
.modal-footer {
  display: flex; justify-content: flex-end; align-items: center; gap: .6rem;
  padding: 1rem 1.5rem; border-top: 1px solid #1e1e2a;
}
.reembed-check {
  display: flex; align-items: center; gap: .4rem;
  font-size: .82rem; color: #a0a0b8; cursor: pointer;
  margin-right: auto; user-select: none;
}
.reembed-check input[type=checkbox] { cursor: pointer; accent-color: #7c7cff; }
.icon-close {
  background: none; border: none; color: #444458; font-size: 1rem; cursor: pointer; line-height: 1;
}
.icon-close:hover { color: #d0d0e0; }
.error-msg { color: #f87171; font-size: .8rem; }
</style>
