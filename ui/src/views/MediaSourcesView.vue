<template>
  <div style="max-width:960px;margin:0 auto;padding:2.5rem 1.25rem">

    <!-- Heading -->
    <div class="page-heading">
      <div class="flex items-center gap-2">
        <button class="back-btn" title="Back to Administration" @click="$router.push('/admin')">
          <ChevronLeft :size="15" />
        </button>
        <HardDrive :size="17" style="color:#555570" />
        <span>Media Sources</span>
      </div>
      <button class="btn-primary" @click="openCreate">
        <Plus :size="14" /> New Source
      </button>
    </div>

    <!-- List -->
    <div v-if="rows.length" class="item-list">
      <div v-for="r in rows" :key="r.uid" class="item-row">
        <span class="type-dot" :style="{ background: r.mediatypeColor }"></span>
        <div class="item-main">
          <div class="flex items-center gap-2">
            <span class="item-name">{{ r.name }}</span>
            <span class="type-chip" :style="{ borderColor: r.mediatypeColor + '55', color: r.mediatypeColor }">
              {{ r.mediatypeName }}
            </span>
          </div>
          <span class="item-path">{{ r.path }}</span>
          <span v-if="r.description" class="item-desc">{{ r.description }}</span>
        </div>
        <div class="item-actions">
          <button class="icon-btn" title="Edit" @click="openEdit(r)"><Pencil :size="14" /></button>
          <button class="icon-btn danger" title="Delete" @click="confirmDelete(r)"><Trash2 :size="14" /></button>
        </div>
      </div>
    </div>
    <div v-else class="empty-hint">
      No media sources yet. Add one to begin indexing.
    </div>

    <!-- Create / Edit modal -->
    <div v-if="modal.open" class="modal-backdrop" @click.self="closeModal">
      <div class="modal">
        <h3 class="modal-title">{{ modal.isEdit ? 'Edit Media Source' : 'New Media Source' }}</h3>

        <label class="field-label">Name <span class="req">*</span></label>
        <input v-model="modal.form.name" type="text" class="field mb-3" placeholder="e.g. Naruto Collection" autofocus />

        <label class="field-label">Root Path <span class="req">*</span></label>
        <input v-model="modal.form.path" type="text" class="field mb-1" placeholder="G:\images\naruto" />
        <span class="field-hint mb-3">Absolute path to the folder containing media files.</span>

        <label class="field-label">Media Type <span class="req">*</span></label>
        <select v-model="modal.form.mediatypeUid" class="field mb-3">
          <option value="" disabled>— select —</option>
          <option v-for="mt in mediaTypes" :key="mt.uid" :value="mt.uid">{{ mt.name }}</option>
        </select>

        <label class="field-label">Description</label>
        <input v-model="modal.form.description" type="text" class="field mb-4" placeholder="Optional notes" />

        <div v-if="modal.error" class="error-msg">{{ modal.error }}</div>

        <div class="modal-actions">
          <button class="btn-secondary" @click="closeModal">Cancel</button>
          <button class="btn-primary" :disabled="modal.saving" @click="save">
            <span v-if="modal.saving">Saving…</span>
            <span v-else>{{ modal.isEdit ? 'Save Changes' : 'Create' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm modal -->
    <div v-if="delModal.open" class="modal-backdrop" @click.self="delModal.open = false">
      <div class="modal">
        <h3 class="modal-title">Delete "{{ delModal.row?.name }}"?</h3>
        <p style="font-size:.85rem;color:#888899;margin:0 0 .5rem">Path: <code style="color:#aaa">{{ delModal.row?.path }}</code></p>
        <p style="font-size:.82rem;color:#555570;margin:0 0 1.25rem">
          Only the source record is removed. Original files are not affected.
        </p>
        <div v-if="delModal.error" class="error-msg">{{ delModal.error }}</div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="delModal.open = false">Cancel</button>
          <button class="btn-danger" :disabled="delModal.deleting" @click="doDelete">
            {{ delModal.deleting ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { HardDrive, Plus, Pencil, Trash2, ChevronLeft } from 'lucide-vue-next'

// ── State ─────────────────────────────────────────────────────────────────────
const rows       = ref([])
const mediaTypes = ref([])

const modal = reactive({
  open: false, isEdit: false, saving: false, error: '',
  uid: null,
  form: { name: '', path: '', mediatypeUid: '', description: '' },
})

const delModal = reactive({ open: false, deleting: false, error: '', row: null })

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  const [srcs, mts] = await Promise.all([
    fetch('/db/mediasources').then(r => r.json()),
    fetch('/db/mediatypes').then(r => r.json()),
  ])
  rows.value       = Array.isArray(srcs) ? srcs : []
  mediaTypes.value = Array.isArray(mts)  ? mts  : []
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openCreate() {
  Object.assign(modal, { open: true, isEdit: false, saving: false, error: '', uid: null })
  Object.assign(modal.form, { name: '', path: '', mediatypeUid: mediaTypes.value[0]?.uid ?? '', description: '' })
}

function openEdit(r) {
  Object.assign(modal, { open: true, isEdit: true, saving: false, error: '', uid: r.uid })
  Object.assign(modal.form, { name: r.name, path: r.path, mediatypeUid: r.mediatypeUid, description: r.description })
}

function closeModal() { modal.open = false }

async function save() {
  if (!modal.form.name.trim())         { modal.error = 'Name is required.';          return }
  if (!modal.form.path.trim())         { modal.error = 'Path is required.';          return }
  if (!modal.form.mediatypeUid)        { modal.error = 'Media type is required.';    return }
  modal.saving = true; modal.error = ''

  const url    = modal.isEdit ? `/db/mediasources/${modal.uid}` : '/db/mediasources'
  const method = modal.isEdit ? 'PUT' : 'POST'
  try {
    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modal.form) })
    const data = await res.json()
    if (!res.ok) { modal.error = data.error || 'Save failed.'; return }
    closeModal()
    await load()
  } catch (e) {
    modal.error = e.message
  } finally {
    modal.saving = false
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────────
function confirmDelete(r) {
  Object.assign(delModal, { open: true, deleting: false, error: '', row: r })
}

async function doDelete() {
  delModal.deleting = true; delModal.error = ''
  try {
    const res  = await fetch(`/db/mediasources/${delModal.row.uid}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { delModal.error = data.error || 'Delete failed.'; return }
    delModal.open = false
    await load()
  } catch (e) {
    delModal.error = e.message
  } finally {
    delModal.deleting = false
  }
}

onMounted(load)
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
.item-list { display: flex; flex-direction: column; gap: .5rem; }
.item-row {
  display: flex; align-items: center; gap: .9rem;
  background: #181820; border: 1px solid #252535; border-radius: 10px;
  padding: .85rem 1.1rem;
  transition: border-color .15s;
}
.item-row:hover { border-color: #353548; }
.type-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 2px; align-self: flex-start; }
.item-main { flex: 1; display: flex; flex-direction: column; gap: .2rem; min-width: 0; }
.item-name { font-size: .88rem; font-weight: 500; color: #d0d0e0; }
.type-chip {
  display: inline-block; font-size: .64rem;
  border: 1px solid; border-radius: 4px; padding: 1px 6px;
  white-space: nowrap;
}
.item-path { font-size: .75rem; color: #666680; font-family: 'Cascadia Code', 'Consolas', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-desc { font-size: .72rem; color: #404055; }
.item-actions { display: flex; gap: .35rem; flex-shrink: 0; }
.icon-btn {
  background: transparent; border: 1px solid #252535; border-radius: 6px;
  color: #555570; width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  transition: border-color .15s, color .15s;
}
.icon-btn:hover        { border-color: #444458; color: #d0d0e0; }
.icon-btn.danger:hover { border-color: #f8717144; color: #f87171; }

.empty-hint { text-align: center; padding: 3rem 1rem; font-size: .85rem; color: #404055; }

.modal-backdrop {
  position: fixed; inset: 0; background: #00000088;
  display: flex; align-items: center; justify-content: center; z-index: 200;
}
.modal {
  background: #181820; border: 1px solid #252535; border-radius: 14px;
  padding: 2rem; width: 100%; max-width: 500px; box-shadow: 0 8px 48px #00000066;
}
.modal-title   { font-size: .95rem; font-weight: 600; color: #d0d0e0; margin: 0 0 1.5rem; }
.field-label   { display: block; font-size: .74rem; color: #555570; margin-bottom: .3rem; }
.field-hint    { display: block; font-size: .7rem; color: #3a3a4a; }
.mb-1 { margin-bottom: .3rem; }
.mb-3 { margin-bottom: .85rem; }
.mb-4 { margin-bottom: 1.1rem; }
.error-msg     { font-size: .78rem; color: #f87171; margin-bottom: .75rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: .5rem; }
.req { color: #f87171; }
.btn-danger {
  display: inline-flex; align-items: center; gap: .375rem;
  padding: .45rem 1.1rem; background: #7f1d1d; color: #fca5a5;
  border: 1px solid #f8717133; border-radius: 6px; font-size: .875rem; cursor: pointer;
  transition: background .15s;
}
.btn-danger:hover    { background: #991b1b; }
.btn-danger:disabled { opacity: .5; cursor: not-allowed; }
</style>
