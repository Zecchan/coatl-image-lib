<template>
  <div style="max-width:880px;margin:0 auto;padding:2.5rem 1.25rem">

    <!-- Heading -->
    <div class="page-heading">
      <div class="flex items-center gap-2">
        <button class="back-btn" title="Back to Administration" @click="$router.push('/admin')">
          <ChevronLeft :size="15" />
        </button>
        <Tag :size="17" style="color:#555570" />
        <span>Media Types</span>
      </div>
      <button class="btn-primary" @click="openCreate">
        <Plus :size="14" /> New Media Type
      </button>
    </div>

    <!-- List -->
    <div v-if="rows.length" class="item-list">
      <div v-for="r in rows" :key="r.uid" class="item-row">
        <span class="color-dot" :style="{ background: r.color }"></span>
        <div class="item-main">
          <span class="item-name">{{ r.name }}</span>
          <span class="item-desc">{{ r.description || '—' }}</span>
        </div>
        <span class="type-badge">{{ typeLabel(r.type) }}</span>
        <div class="item-actions">
          <button class="icon-btn" title="Edit" @click="openEdit(r)"><Pencil :size="14" /></button>
          <button class="icon-btn danger" title="Delete" @click="confirmDelete(r)"><Trash2 :size="14" /></button>
        </div>
      </div>
    </div>
    <div v-else class="empty-hint">
      No media types yet. Create one to get started.
    </div>

    <!-- Create / Edit modal -->
    <div v-if="modal.open" class="modal-backdrop" @click.self="closeModal">
      <div class="modal">
        <h3 class="modal-title">{{ modal.isEdit ? 'Edit Media Type' : 'New Media Type' }}</h3>

        <label class="field-label">Name <span class="req">*</span></label>
        <input v-model="modal.form.name" type="text" class="field mb-3" placeholder="e.g. Anime Artworks" autofocus />

        <label class="field-label">Description</label>
        <input v-model="modal.form.description" type="text" class="field mb-3" placeholder="Optional description" />

        <label class="field-label">Type <span class="req">*</span></label>
        <select v-model="modal.form.type" class="field mb-3">
          <option v-for="(label, value) in MEDIA_TYPE_LABELS" :key="value" :value="Number(value)">{{ label }}</option>
        </select>

        <label class="field-label">Accent Color</label>
        <div class="flex items-center gap-3 mb-4">
          <input v-model="modal.form.color" type="color" class="color-picker" />
          <input v-model="modal.form.color" type="text" class="field flex-1" placeholder="#7c5cbf" maxlength="7" />
        </div>

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
        <p style="font-size:.85rem;color:#888899;margin:0 0 1.25rem">
          This cannot be undone. Media sources using this type must be reassigned first.
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
import { Tag, Plus, Pencil, Trash2, ChevronLeft } from 'lucide-vue-next'
import { MEDIA_TYPE_LABELS, MEDIA_TYPE_IMAGE_COLLECTION } from '../mediatypeEnum.js'

// ── State ────────────────────────────────────────────────────────────────────
const rows = ref([])

const modal = reactive({
  open: false, isEdit: false, saving: false, error: '',
  uid: null,
  form: { name: '', description: '', color: '#7c5cbf', type: MEDIA_TYPE_IMAGE_COLLECTION },
})

const delModal = reactive({ open: false, deleting: false, error: '', row: null })

// ── Helpers ──────────────────────────────────────────────────────────────────
function typeLabel(t) { return MEDIA_TYPE_LABELS[t] ?? `Type ${t}` }

async function load() {
  const res = await fetch('/db/mediatypes')
  rows.value = res.ok ? await res.json() : []
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openCreate() {
  Object.assign(modal, { open: true, isEdit: false, saving: false, error: '', uid: null })
  Object.assign(modal.form, { name: '', description: '', color: '#7c5cbf', type: MEDIA_TYPE_IMAGE_COLLECTION })
}

function openEdit(r) {
  Object.assign(modal, { open: true, isEdit: true, saving: false, error: '', uid: r.uid })
  Object.assign(modal.form, { name: r.name, description: r.description, color: r.color, type: r.type })
}

function closeModal() { modal.open = false }

async function save() {
  if (!modal.form.name.trim()) { modal.error = 'Name is required.'; return }
  modal.saving = true; modal.error = ''
  const url    = modal.isEdit ? `/db/mediatypes/${modal.uid}` : '/db/mediatypes'
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

// ── Delete ────────────────────────────────────────────────────────────────────
function confirmDelete(r) {
  Object.assign(delModal, { open: true, deleting: false, error: '', row: r })
}

async function doDelete() {
  delModal.deleting = true; delModal.error = ''
  try {
    const res  = await fetch(`/db/mediatypes/${delModal.row.uid}`, { method: 'DELETE' })
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
.color-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.item-main { flex: 1; display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
.item-name { font-size: .88rem; font-weight: 500; color: #d0d0e0; }
.item-desc { font-size: .74rem; color: #555570; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.type-badge {
  font-size: .68rem; color: #555570;
  background: #1e1e2a; border: 1px solid #252535;
  border-radius: 4px; padding: 2px 8px; white-space: nowrap; flex-shrink: 0;
}
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

/* Modal */
.modal-backdrop {
  position: fixed; inset: 0; background: #00000088;
  display: flex; align-items: center; justify-content: center; z-index: 200;
}
.modal {
  background: #181820; border: 1px solid #252535; border-radius: 14px;
  padding: 2rem; width: 100%; max-width: 460px; box-shadow: 0 8px 48px #00000066;
}
.modal-title { font-size: .95rem; font-weight: 600; color: #d0d0e0; margin: 0 0 1.5rem; }
.field-label { display: block; font-size: .74rem; color: #555570; margin-bottom: .3rem; }
.mb-3 { margin-bottom: .85rem; }
.mb-4 { margin-bottom: 1.1rem; }
.color-picker {
  width: 38px; height: 36px; border: 1px solid #252535; border-radius: 6px;
  padding: 2px; background: #111118; cursor: pointer; flex-shrink: 0;
}
.error-msg  { font-size: .78rem; color: #f87171; margin-bottom: .75rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: .5rem; }
.req { color: #f87171; }
.btn-danger {
  display: inline-flex; align-items: center; gap: .375rem;
  padding: .45rem 1.1rem; background: #7f1d1d; color: #fca5a5;
  border: 1px solid #f8717133; border-radius: 6px; font-size: .875rem; cursor: pointer;
  transition: background .15s;
}
.btn-danger:hover   { background: #991b1b; }
.btn-danger:disabled { opacity: .5; cursor: not-allowed; }
</style>
