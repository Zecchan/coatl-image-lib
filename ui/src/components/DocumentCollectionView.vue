<template>
  <div class="doc-view">
    <div class="doc-toolbar">
      <span class="doc-count" v-if="!loading">{{ total }} document{{ total === 1 ? '' : 's' }}</span>
      <div v-if="loading" class="spinner sm"></div>
    </div>

    <div class="doc-table-wrap">
      <table class="doc-table">
        <thead>
          <tr>
            <th class="col-ext">Type</th>
            <th class="col-name">Filename</th>
            <th class="col-path">Path</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="3" class="state-cell"><div class="spinner sm"></div></td>
          </tr>
          <tr v-else-if="!items.length">
            <td colspan="3" class="state-cell" style="color:#555570">No documents found.</td>
          </tr>
          <tr v-else v-for="doc in items" :key="doc.rel" class="doc-row" @click="openDoc(doc)">
            <td class="col-ext">
              <span class="ext-badge" :class="'ext-' + doc.ext.replace('.','')">{{ doc.ext }}</span>
            </td>
            <td class="col-name">{{ doc.name }}</td>
            <td class="col-path">{{ doc.rel }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <button class="btn-secondary" :disabled="page <= 1" @click="goPage(page - 1)">‹ Prev</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="btn-secondary" :disabled="page >= totalPages" @click="goPage(page + 1)">Next ›</button>
    </div>

    <div v-if="error" class="error-msg" style="margin-top:.75rem">{{ error }}</div>
  </div>

  <!-- Document preview dialog -->
  <Teleport to="body">
    <div v-if="preview.open" class="doc-backdrop" @click.self="closePreview">
      <div class="doc-modal">
        <div class="doc-modal-header">
          <span class="doc-modal-title" :title="preview.doc?.rel">{{ preview.doc?.name }}</span>
          <button class="doc-modal-close" @click="closePreview"><X :size="18" /></button>
        </div>
        <div class="doc-modal-body">
          <!-- PDF: inline browser viewer -->
          <iframe
            v-if="preview.type === 'pdf'"
            :src="preview.url"
            class="doc-iframe"
            frameborder="0"
          />
          <!-- Text: fetched and rendered -->
          <div v-else-if="preview.type === 'text'" class="doc-text-wrap">
            <div v-if="preview.loading" class="doc-text-loading"><div class="spinner sm"></div></div>
            <pre v-else class="doc-text-content">{{ preview.textContent }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({ media: { type: Object, required: true } })

const loading   = ref(false)
const error     = ref('')
const items     = ref([])
const total     = ref(0)
const page      = ref(1)
const pageSize  = ref(200)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

async function fetchDocs() {
  loading.value = true
  error.value   = ''
  try {
    const r = await fetch(`/scan/documents/${props.media.uid}?page=${page.value}&pageSize=${pageSize.value}`)
    if (!r.ok) { error.value = 'Failed to load documents.'; return }
    const data = await r.json()
    items.value = data.items
    total.value = data.total
    page.value  = data.page
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function goPage(p) {
  page.value = p
  fetchDocs()
}

// ── Document preview ──────────────────────────────────────────────────────────
const TEXT_EXTS = new Set(['.txt', '.md', '.rst'])

const preview = ref({ open: false, doc: null, type: '', url: '', textContent: '', loading: false })

function docfileUrl(doc) {
  const encodedRel = doc.rel.split('/').map(encodeURIComponent).join('/')
  return `/scan/docfile/${props.media.uid}/${encodedRel}`
}

async function openDoc(doc) {
  const ext = doc.ext
  const url = docfileUrl(doc)
  if (ext === '.docx') {
    // Trigger download via temporary anchor
    const a = document.createElement('a')
    a.href = url
    a.download = doc.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return
  }
  if (ext === '.pdf') {
    preview.value = { open: true, doc, type: 'pdf', url, textContent: '', loading: false }
    return
  }
  if (TEXT_EXTS.has(ext)) {
    preview.value = { open: true, doc, type: 'text', url, textContent: '', loading: true }
    try {
      const r = await fetch(url)
      preview.value.textContent = r.ok ? await r.text() : 'Failed to load file.'
    } catch (e) {
      preview.value.textContent = 'Error: ' + e.message
    } finally {
      preview.value.loading = false
    }
  }
}

function closePreview() {
  preview.value.open = false
}

function onKeyDown(e) {
  if (e.key === 'Escape' && preview.value.open) closePreview()
}

onMounted(() => { fetchDocs(); document.addEventListener('keydown', onKeyDown) })
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))
watch(() => props.media.uid, fetchDocs)
</script>

<style scoped>
.doc-view { padding: 0 0 1rem; }

.doc-toolbar {
  display: flex; align-items: center; gap: .75rem;
  padding: .5rem 0 .75rem;
  color: #555570; font-size: .8rem;
}
.doc-count { color: #888899; }

.doc-table-wrap {
  overflow-x: auto;
  border: 1px solid #252535;
  border-radius: 8px;
}
.doc-table {
  width: 100%; border-collapse: collapse;
  font-size: .82rem; color: #c0c0d0;
}
.doc-table thead tr { background: #16161f; }
.doc-table th {
  padding: .5rem .75rem;
  text-align: left; font-weight: 600;
  color: #555570; font-size: .74rem;
  border-bottom: 1px solid #252535;
}
.doc-table td { padding: .45rem .75rem; border-bottom: 1px solid #1a1a28; }
.doc-row:last-child td { border-bottom: none; }
.doc-row:hover td { background: #14141d; }
.doc-row { cursor: pointer; }

.col-ext  { width: 64px; }
.col-name { width: 260px; word-break: break-word; }
.col-path { color: #444458; word-break: break-all; }

.ext-badge {
  display: inline-block;
  padding: .15em .45em;
  border-radius: 4px;
  font-size: .7rem; font-weight: 600;
  background: #1e1e2a; color: #888899;
  border: 1px solid #252535;
}
.ext-txt  { background: #1a1f2a; color: #60a5fa; border-color: #1e3a5f; }
.ext-md   { background: #1a2a1a; color: #4ade80; border-color: #1e4a1e; }
.ext-rst  { background: #2a1f1a; color: #fb923c; border-color: #4a2e1e; }
.ext-docx { background: #1a1f2e; color: #818cf8; border-color: #1e245f; }
.ext-pdf  { background: #2a1a1a; color: #f87171; border-color: #4a1e1e; }

.state-cell { text-align: center; padding: 2rem; }

.pagination {
  display: flex; align-items: center; gap: .75rem;
  margin-top: .75rem; justify-content: center;
  font-size: .82rem;
}
.page-info { color: #555570; }

.btn-secondary {
  background: transparent; border: 1px solid #252535;
  color: #888899; border-radius: 6px;
  padding: .3rem .7rem; font-size: .78rem; cursor: pointer;
}
.btn-secondary:hover:not(:disabled) { border-color: #3a3a5a; color: #c0c0d0; }
.btn-secondary:disabled { opacity: .4; cursor: default; }

.spinner.sm {
  width: 14px; height: 14px;
  border: 2px solid #252535; border-top-color: #818cf8;
  border-radius: 50%; animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-msg { color: #f87171; font-size: .82rem; }

/* ── Preview dialog ── */
.doc-backdrop {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0,0,0,.78);
  display: flex; align-items: center; justify-content: center;
  padding: 2rem;
}
.doc-modal {
  display: flex; flex-direction: column;
  width: 92vw; height: 90vh;
  max-width: 1100px;
  background: #16161f;
  border: 1px solid #252535;
  border-radius: 10px;
  overflow: hidden;
}
.doc-modal-header {
  display: flex; align-items: center; gap: .75rem;
  padding: .65rem 1rem;
  border-bottom: 1px solid #252535;
  background: #111118;
  flex-shrink: 0;
}
.doc-modal-title {
  flex: 1; font-size: .88rem; font-weight: 600;
  color: #d0d0e0; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.doc-modal-close {
  background: none; border: none; cursor: pointer;
  color: #555570; padding: .2rem; border-radius: 4px;
  display: flex; align-items: center;
}
.doc-modal-close:hover { color: #c0c0d0; background: #1e1e2a; }
.doc-modal-body {
  flex: 1; overflow: hidden;
}
.doc-iframe {
  width: 100%; height: 100%; border: none; display: block;
}
.doc-text-wrap {
  height: 100%; overflow-y: auto;
  padding: 1.75rem 2.25rem;
  background: #13131b;
  box-sizing: border-box;
}
.doc-text-loading {
  display: flex; justify-content: center; margin-top: 3rem;
}
.doc-text-content {
  margin: 0;
  font-family: Georgia, Cambria, 'Times New Roman', serif;
  font-size: 1rem; line-height: 1.8;
  color: #d0cfc8;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
