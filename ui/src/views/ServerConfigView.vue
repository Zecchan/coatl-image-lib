<template>
  <div style="max-width:680px;margin:0 auto;padding:2.5rem 1.25rem">

    <h2 class="page-heading">
      <SlidersHorizontal :size="17" /> Server Configuration
    </h2>

    <!-- Site Settings -->
    <section class="section-card">
      <h3 class="section-title">
        <Globe :size="14" style="color:#60a5fa" /> Site Settings
      </h3>
      <div class="field-row">
        <label class="field-label">Library Title</label>
        <input v-model="form.site.title" type="text" class="field" placeholder="Coatl Image Library" />
        <span class="field-hint">Displayed in the browser tab and navbar.</span>
      </div>
    </section>

    <!-- SQLite -->
    <section class="section-card">
      <h3 class="section-title">
        <HardDrive :size="14" style="color:#34d399" /> SQLite Database
      </h3>
      <div class="field-row">
        <label class="field-label">Database Path</label>
        <input v-model="form.sqlite.path" type="text" class="field" placeholder="./data/coatl.db" />
        <span class="field-hint">Relative to <code>ui/</code>, or absolute path.</span>
      </div>
      <div class="note-box">
        <Info :size="13" style="flex-shrink:0;margin-top:2px" />
        <span>SQLite via <code>better-sqlite3</code> — no separate install needed. File is created on first use.</span>
      </div>
    </section>

    <!-- Qdrant -->
    <section class="section-card">
      <h3 class="section-title">
        <Network :size="14" style="color:#fbbf24" /> Qdrant Vector Database
      </h3>
      <div style="display:grid;grid-template-columns:1fr 100px;gap:.75rem;margin-bottom:.75rem">
        <div class="field-row" style="margin:0">
          <label class="field-label">Host</label>
          <input v-model="form.qdrant.host" type="text" class="field" placeholder="127.0.0.1" />
        </div>
        <div class="field-row" style="margin:0">
          <label class="field-label">Port</label>
          <input v-model.number="form.qdrant.port" type="number" class="field" placeholder="6333" min="1" max="65535" />
        </div>
      </div>
      <div class="field-row">
        <label class="field-label">Image Collection Name</label>
        <input v-model="form.qdrant.collectionName" type="text" class="field" placeholder="coatl_images" />
        <span class="field-hint">Used for image/video CLIP embeddings (512-dim).</span>
      </div>
      <div class="field-row">
        <label class="field-label">Text Collection Name</label>
        <input v-model="form.qdrant.textCollectionName" type="text" class="field" placeholder="coatl_text" />
        <span class="field-hint">Used for lyrics/text embeddings (384-dim). Changing requires Python API restart.</span>
      </div>
      <div class="note-box">
        <Info :size="13" style="flex-shrink:0;margin-top:2px" />
        <span>
          Qdrant must be installed separately —
          <a href="https://qdrant.tech/documentation/quick-start/" target="_blank" class="note-link">qdrant.tech</a>
          or <code>docker run -p 6333:6333 qdrant/qdrant</code>
        </span>
      </div>
    </section>

    <!-- Embedding -->
    <section class="section-card">
      <h3 class="section-title">
        <Cpu :size="14" style="color:#c084fc" /> Embedding
      </h3>
      <div class="field-row">
        <label class="field-label">Image Embedding Limit</label>
        <input v-model.number="form.embedding.maxImagesPerMedia" type="number" class="field" min="1" max="10000" style="max-width:120px" />
        <span class="field-hint">Maximum number of images indexed per image collection. Higher values improve search recall but increase processing time and Qdrant storage.</span>
      </div>
      <div class="note-box">
        <Info :size="13" style="flex-shrink:0;margin-top:2px" />
        <span>When a collection has more images than the limit, a random sample is taken. Default: 200. Re-indexing is required for changes to take effect on existing collections.</span>
      </div>
    </section>

    <!-- Actions -->
    <div style="display:flex;justify-content:flex-end;gap:.5rem;margin-bottom:.5rem">
      <button class="btn-secondary" @click="loadConfig">
        <RotateCcw :size="13" /> Reset
      </button>
      <button class="btn-primary" @click="saveConfig">
        <Save :size="13" /> Save Configuration
      </button>
    </div>

    <!-- Toast -->
    <Transition name="toast">
      <div v-if="toast.visible" class="toast" :class="toast.type">
        <CheckCircle v-if="toast.type === 'ok'" :size="14" />
        <XCircle v-else :size="14" />
        {{ toast.msg }}
      </div>
    </Transition>

  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import {
  SlidersHorizontal, Globe, HardDrive, Network,
  Info, RotateCcw, Save, CheckCircle, XCircle, Cpu,
} from 'lucide-vue-next'

const form = reactive({
  site:      { title: '' },
  sqlite:    { path: '' },
  qdrant:    { host: '', port: 6333, collectionName: '', textCollectionName: '' },
  embedding: { maxImagesPerMedia: 200 },
})

const toast = reactive({ visible: false, msg: '', type: 'ok' })
let toastTimer

function showToast(msg, type = 'ok') {
  toast.msg = msg; toast.type = type; toast.visible = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.visible = false }, 3000)
}

async function loadConfig() {
  try {
    const cfg = await fetch('/config').then(r => r.json())
    form.site.title            = cfg.site?.title            || ''
    form.sqlite.path           = cfg.sqlite?.path           || ''
    form.qdrant.host               = cfg.qdrant?.host               || ''
    form.qdrant.port               = cfg.qdrant?.port               ?? 6333
    form.qdrant.collectionName     = cfg.qdrant?.collectionName     || ''
    form.qdrant.textCollectionName = cfg.qdrant?.textCollectionName || ''
    form.embedding.maxImagesPerMedia = cfg.embedding?.maxImagesPerMedia ?? 200
  } catch (e) {
    showToast('Failed to load config: ' + e.message, 'err')
  }
}

async function saveConfig() {
  const payload = {
    site:   { title: form.site.title.trim()           || 'Coatl Image Library' },
    sqlite: { path:  form.sqlite.path.trim()          || './data/coatl.db' },
    qdrant: {
      host:           form.qdrant.host.trim()           || '127.0.0.1',
      port:           Number(form.qdrant.port)          || 6333,
      collectionName:     form.qdrant.collectionName.trim()     || 'coatl_images',
      textCollectionName: form.qdrant.textCollectionName.trim() || 'coatl_text',
    },
    embedding: {
      maxImagesPerMedia: Math.max(1, Math.round(Number(form.embedding.maxImagesPerMedia) || 200)),
    },
  }
  try {
    const r    = await fetch('/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await r.json()
    if (data.ok) showToast('Configuration saved.')
    else showToast('Save failed: ' + data.error, 'err')
  } catch (e) {
    showToast('Save failed: ' + e.message, 'err')
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.page-heading {
  display: flex; align-items: center; gap: .5rem;
  color: #555570; font-size: .95rem; font-weight: 400; margin: 0 0 2rem;
}
.section-card {
  background: #181820;
  border: 1px solid #252535;
  border-radius: 12px;
  padding: 1.4rem 1.5rem;
  margin-bottom: 1rem;
}
.section-title {
  display: flex; align-items: center; gap: .4rem;
  font-size: .82rem; font-weight: 600; color: #c0c0d0;
  margin: 0 0 1.1rem;
  padding-bottom: .65rem;
  border-bottom: 1px solid #1e1e2a;
}
.field-row        { margin-bottom: .9rem; }
.field-row:last-child { margin-bottom: 0; }
.field-label      { display: block; font-size: .74rem; color: #555570; margin-bottom: .3rem; }
.field-hint       { display: block; font-size: .7rem; color: #3a3a4a; margin-top: .3rem; }
code              { color: #888899; font-size: .8em; }
.note-box {
  display: flex; align-items: flex-start; gap: .5rem;
  background: #111118; border: 1px solid #1a1a28;
  border-radius: 8px; padding: .65rem .9rem;
  font-size: .74rem; color: #555570; margin-top: .75rem; line-height: 1.55;
}
.note-link       { color: #7c5cbf; text-decoration: none; }
.note-link:hover { text-decoration: underline; }
.toast {
  position: fixed; bottom: 1.5rem; right: 1.5rem;
  display: flex; align-items: center; gap: .5rem;
  padding: .55rem 1.1rem;
  background: #1a1a24; border-radius: 8px; font-size: .82rem;
  box-shadow: 0 4px 24px #00000055; z-index: 9999;
}
.toast.ok  { border: 1px solid #34d39933; color: #34d399; }
.toast.err { border: 1px solid #f8717133; color: #f87171; }
</style>