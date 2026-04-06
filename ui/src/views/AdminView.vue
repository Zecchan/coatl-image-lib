<template>
  <div style="max-width:960px;margin:0 auto;padding:2.5rem 1.25rem">

    <h2 class="page-heading">
      <Settings :size="17" /> Administration
    </h2>

    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1rem">

      <!-- Server Config -->
      <div class="card card-link" @click="$router.push('/serverconfig')">
        <SlidersHorizontal :size="26" style="color:#7c5cbf;margin-bottom:.75rem" />
        <h3 class="card-title">Server Configuration</h3>
        <p class="card-desc">Configure SQLite, Qdrant connection, and site settings.</p>
        <span style="font-size:.78rem;color:#7c5cbf;display:flex;align-items:center;gap:.3rem">
          <ArrowRight :size="13" /> Open
        </span>
      </div>

      <!-- API Status -->
      <div class="card">
        <Cpu :size="26" style="color:#fbbf24;margin-bottom:.75rem" />
        <h3 class="card-title">API Status</h3>
        <p class="card-desc">Python AI backend health check.</p>
        <div class="status-html" v-html="statusHtml"></div>
        <button class="btn-secondary mt-3" style="font-size:.78rem" @click="checkApi">
          <RotateCw :size="12" /> Refresh
        </button>
      </div>

      <!-- Media Types -->
      <div class="card card-link" @click="$router.push('/mediatypes')">
        <Tag :size="26" style="color:#a78bfa;margin-bottom:.75rem" />
        <h3 class="card-title">Media Types</h3>
        <p class="card-desc">Define categories of media collections — name, color, and type.</p>
        <span style="font-size:.78rem;color:#a78bfa;display:flex;align-items:center;gap:.3rem">
          <ArrowRight :size="13" /> Manage
        </span>
      </div>

      <!-- Media Sources -->
      <div class="card card-link" @click="$router.push('/mediasources')">
        <HardDrive :size="26" style="color:#34d399;margin-bottom:.75rem" />
        <h3 class="card-title">Media Sources</h3>
        <p class="card-desc">Root folders containing media files. Switch paths without re-indexing.</p>
        <span style="font-size:.78rem;color:#34d399;display:flex;align-items:center;gap:.3rem">
          <ArrowRight :size="13" /> Manage
        </span>
      </div>

      <!-- Index Folder -->
      <div class="card card-link" @click="$router.push('/indexfolder')">
        <FolderPlus :size="26" style="color:#60a5fa;margin-bottom:.75rem" />
        <h3 class="card-title">Index Folder</h3>
        <p class="card-desc">Scan a folder and add all images — embeddings, hashes, captions, and tags.</p>
        <span style="font-size:.78rem;color:#60a5fa;display:flex;align-items:center;gap:.3rem">
          <ArrowRight :size="13" /> Open
        </span>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {
  Settings, FolderPlus,
  Cpu, RotateCw, SlidersHorizontal, ArrowRight,
  Tag, HardDrive,
} from 'lucide-vue-next'
import { API_BASE } from '../api.js'

const statusHtml = ref('<span style="color:#555570;font-style:italic">Checking…</span>')

async function checkApi() {
  statusHtml.value = '<span style="color:#555570;font-style:italic">Checking…</span>'
  try {
    const r    = await fetch(`${API_BASE}/`)
    const data = await r.json()
    statusHtml.value =
      '<span style="color:#34d399">● Online</span>' +
      `<span style="color:#404055;font-size:.72rem;margin-left:.5rem">${JSON.stringify(data)}</span>`
  } catch {
    statusHtml.value = '<span style="color:#f87171">● Offline — is the Python API running?</span>'
  }
}

onMounted(checkApi)
</script>

<style scoped>
.page-heading {
  display: flex;
  align-items: center;
  gap: .5rem;
  color: #555570;
  font-size: .95rem;
  font-weight: 400;
  margin: 0 0 2rem;
}
.card {
  background: #181820;
  border: 1px solid #252535;
  border-radius: 12px;
  padding: 1.4rem 1.5rem;
  transition: border-color .15s;
}
.card:hover       { border-color: #353548; }
.card-link        { cursor: pointer; }
.card-link:hover  { border-color: #7c5cbf44; }
.card-title       { font-size: .88rem; font-weight: 600; color: #d0d0e0; margin: 0 0 .35rem; }
.card-desc        { font-size: .78rem; color: #666680; margin: 0 0 .8rem; line-height: 1.55; }
.badge {
  display: inline-block;
  font-size: .65rem;
  background: #1e1e2a;
  color: #404050;
  border: 1px solid #252535;
  border-radius: 4px;
  padding: 2px 8px;
  letter-spacing: .04em;
}
.status-html { font-size: .8rem; margin-top: .25rem; }
.mt-3 { margin-top: .75rem; }
</style>