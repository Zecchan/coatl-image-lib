<template>
  <div class="music-view">

    <!-- Track list -->
    <div class="track-table-wrap">
      <table class="track-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-title">Title</th>
            <th class="col-artist">Artist</th>
            <th class="col-album">Album</th>
            <th class="col-disc">Disc</th>
            <th class="col-dur">Duration</th>
            <th class="col-embed" title="Lyrics embedded for search"></th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="8" class="state-cell"><div class="spinner sm"></div></td>
          </tr>
          <tr v-else-if="!tracks.length">
            <td colspan="8" class="state-cell" style="color:#555570">No tracks found.</td>
          </tr>
          <template v-else>
            <tr
              v-for="track in tracks"
              :key="track.uid"
              class="track-row"
              :class="{ playing: currentUid === track.uid }"
              @click="playTrack(track)"
            >
              <td class="col-num">
                <span v-if="currentUid === track.uid" class="play-anim">♫</span>
                <span v-else>{{ track.track_number ?? '–' }}</span>
              </td>
              <td class="col-title">{{ track.title || track.filename }}</td>
              <td class="col-artist">{{ track.artist || media.artist || '' }}</td>
              <td class="col-album">{{ track.album || '' }}</td>
              <td class="col-disc">{{ track.disc_number ?? '' }}</td>
              <td class="col-dur">{{ fmtDur(track.duration) }}</td>
              <td class="col-embed">
                <Zap v-if="track.qdrant_indexed_at" :size="12" class="embed-icon" :title="'Embedded ' + track.qdrant_indexed_at" />
              </td>
              <td class="col-actions">
                <button class="icon-btn" title="Edit" @click.stop="openEdit(track)">
                  <Pencil :size="13" />
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Sticky audio player -->
    <Teleport to="body">
      <!-- Lyrics panel -->
      <div v-if="showLyrics && currentTrack?.lyrics" class="lyrics-panel">
        <div class="lyrics-panel-header">
          <span>{{ currentTrack.title || currentTrack.filename }}</span>
          <button class="icon-btn light" @click="showLyrics = false"><X :size="13" /></button>
        </div>
        <pre class="lyrics-panel-text">{{ currentTrack.lyrics }}</pre>
      </div>
      <!-- Audio bar -->
      <div v-if="currentTrack" class="audio-bar">
        <audio
          ref="audioEl"
          :src="audioSrc(currentTrack)"
          controls
          autoplay
          @ended="onEnded"
          style="flex:1;min-width:0;height:36px"
        ></audio>
        <button v-if="currentTrack.lyrics" class="lyrics-btn" :class="{ active: showLyrics }" @click="showLyrics = !showLyrics">Lyrics</button>
        <span class="audio-title">{{ currentTrack.title || currentTrack.filename }}</span>
        <button class="icon-btn light" @click="closePlayer"><X :size="14" /></button>
      </div>
    </Teleport>

    <!-- Edit modal -->
    <div v-if="editModal.open" class="modal-backdrop" @click.self="closeEdit">
      <div class="edit-modal">
        <div class="edit-modal-header">
          <span>Edit Track</span>
          <button class="icon-close" @click="closeEdit">✕</button>
        </div>
        <div class="edit-modal-body">
          <div class="form-row">
            <label>Title</label>
            <input v-model="editModal.form.title" type="text" class="field" />
          </div>
          <div class="form-row">
            <label>Artist</label>
            <input v-model="editModal.form.artist" type="text" class="field" />
          </div>
          <div class="form-row">
            <label>Album</label>
            <input v-model="editModal.form.album" type="text" class="field" />
          </div>
          <div class="form-row two-col">
            <div>
              <label>Track #</label>
              <input v-model.number="editModal.form.track_number" type="number" class="field" min="1" />
            </div>
            <div>
              <label>Disc #</label>
              <input v-model.number="editModal.form.disc_number" type="number" class="field" min="1" />
            </div>
          </div>
          <div class="form-row">
            <label>Lyrics</label>
            <textarea v-model="editModal.form.lyrics" class="field lyrics-area" rows="12" placeholder="Paste lyrics here…"></textarea>
          </div>
          <div v-if="editModal.error" class="error-msg">{{ editModal.error }}</div>
        </div>
        <div class="edit-modal-footer">
          <button class="btn-secondary" :disabled="editModal.saving" @click="closeEdit">Cancel</button>
          <button class="btn-primary" :disabled="editModal.saving" @click="saveEdit">
            {{ editModal.saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import { Pencil, X, Zap } from 'lucide-vue-next'

const props = defineProps({ media: { type: Object, required: true } })

const showLyrics  = ref(false)
const tracks      = ref([])
const loading     = ref(true)
const currentUid  = ref(null)
const currentTrack = ref(null)
const audioEl     = ref(null)

const editModal = reactive({
  open: false, saving: false, error: '',
  uid: null,
  form: { title: '', artist: '', album: '', track_number: null, disc_number: null, lyrics: '' },
})

async function loadTracks() {
  loading.value = true
  try {
    const r = await fetch(`/db/audiofiles/${props.media.uid}`)
    tracks.value = r.ok ? await r.json() : []
  } catch {
    tracks.value = []
  } finally {
    loading.value = false
  }
}

function audioSrc(track) {
  const encoded = track.filename.split('/').map(encodeURIComponent).join('/')
  return `/scan/audio/${props.media.uid}/${encoded}`
}

function playTrack(track) {
  if (currentUid.value === track.uid) {
    // Toggle play/pause
    if (audioEl.value?.paused) audioEl.value.play()
    else audioEl.value?.pause()
    return
  }
  currentUid.value = track.uid
  currentTrack.value = track
}

function closePlayer() {
  if (audioEl.value) { audioEl.value.pause(); audioEl.value.src = '' }
  currentUid.value = null
  currentTrack.value = null
  showLyrics.value = false
}

function onEnded() {
  // Play next track
  const idx = tracks.value.findIndex(t => t.uid === currentUid.value)
  if (idx >= 0 && idx < tracks.value.length - 1) {
    playTrack(tracks.value[idx + 1])
  } else {
    closePlayer()
  }
}

function fmtDur(secs) {
  if (!secs) return ''
  const m = Math.floor(secs / 60)
  const s = String(Math.floor(secs % 60)).padStart(2, '0')
  return `${m}:${s}`
}

function openEdit(track) {
  editModal.uid = track.uid
  editModal.form = {
    title:        track.title || '',
    artist:       track.artist || '',
    album:        track.album || '',
    track_number: track.track_number ?? null,
    disc_number:  track.disc_number ?? null,
    lyrics:       track.lyrics || '',
  }
  editModal.error = ''
  editModal.open = true
}

function closeEdit() {
  if (!editModal.saving) editModal.open = false
}

async function saveEdit() {
  editModal.saving = true
  editModal.error = ''
  try {
    const r = await fetch(`/db/audiofiles/${editModal.uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editModal.form),
    })
    if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`)
    const updated = await r.json()
    const idx = tracks.value.findIndex(t => t.uid === editModal.uid)
    if (idx >= 0) tracks.value[idx] = updated
    if (currentUid.value === editModal.uid) currentTrack.value = updated
    editModal.open = false
  } catch (e) {
    editModal.error = e.message
  } finally {
    editModal.saving = false
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && editModal.open) closeEdit()
}

onMounted(() => {
  loadTracks()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  closePlayer()
})
</script>

<style scoped>
.music-view { padding: 1.5rem 0 5rem; }

.track-table-wrap {
  overflow-x: auto;
  border: 1px solid #1e1e2e;
  border-radius: 10px;
  background: #0e0e16;
}

.track-table {
  width: 100%;
  border-collapse: collapse;
  font-size: .82rem;
}

.track-table th {
  background: #111119;
  color: #44445a;
  font-weight: 500;
  padding: .55rem .9rem;
  text-align: left;
  border-bottom: 1px solid #1a1a28;
  user-select: none;
}

.track-row {
  cursor: pointer;
  transition: background .12s;
}
.track-row:hover { background: #14141f; }
.track-row.playing { background: #18102a; }
.track-row td {
  padding: .5rem .9rem;
  border-bottom: 1px solid #111118;
  color: #c0c0d5;
  vertical-align: middle;
}
.track-row:last-child td { border-bottom: none; }

.col-num     { width: 42px; color: #444458; text-align: center; }
.col-title   { min-width: 180px; }
.col-artist  { min-width: 130px; }
.col-album   { min-width: 130px; }
.col-disc    { width: 44px; text-align: center; color: #555570; }
.col-dur     { width: 70px; text-align: right; color: #555570; }
.col-embed   { width: 24px; text-align: center; }
.col-actions { width: 36px; text-align: center; }

.play-anim { color: #9b72cf; font-size: .95rem; }

.embed-icon { color: #9b72cf; display: block; margin: 0 auto; }

.state-cell { text-align: center; padding: 2.5rem; }

.icon-btn {
  background: none; border: none; cursor: pointer;
  color: #555570; padding: 3px; border-radius: 4px;
  display: inline-flex; align-items: center; transition: color .15s;
}
.icon-btn:hover { color: #c0c0d5; }
.icon-btn.light { color: #a0a0c0; }
.icon-btn.light:hover { color: #fff; }

/* Sticky audio bar */
.audio-bar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  background: #111119;
  border-top: 1px solid #252535;
  padding: .6rem 1.25rem;
  display: flex;
  align-items: center;
  gap: .75rem;
  z-index: 200;
}
.audio-title {
  font-size: .78rem; color: #9090b0;
  max-width: 260px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex-shrink: 0;
}
.lyrics-btn {
  background: #1e1e30; border: 1px solid #353550; border-radius: 5px;
  color: #9090b0; font-size: .73rem; padding: .25rem .65rem;
  cursor: pointer; flex-shrink: 0; transition: color .15s, border-color .15s;
}
.lyrics-btn:hover { color: #c0c0d5; border-color: #555570; }
.lyrics-btn.active { color: #9b72cf; border-color: #7c5cbf; }

/* Lyrics hover panel */
.lyrics-panel {
  position: fixed;
  bottom: 62px;
  right: 1.25rem;
  width: min(420px, calc(100vw - 2.5rem));
  max-height: 50vh;
  background: #111119;
  border: 1px solid #252535;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  z-index: 199;
  box-shadow: 0 -4px 24px rgba(0,0,0,.5);
}
.lyrics-panel-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: .55rem .85rem;
  border-bottom: 1px solid #1e1e2e;
  font-size: .78rem; font-weight: 600; color: #c8c8e0;
  flex-shrink: 0;
}
.lyrics-panel-text {
  margin: 0;
  padding: .85rem;
  overflow-y: auto;
  font-family: inherit;
  font-size: .8rem;
  line-height: 1.65;
  color: #b0b0cc;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Edit modal */
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.6);
  display: flex; align-items: center; justify-content: center; z-index: 300;
}
.edit-modal {
  background: #141420; border: 1px solid #252535; border-radius: 12px;
  width: min(560px, 95vw); max-height: 90vh; display: flex; flex-direction: column;
}
.edit-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: .9rem 1.25rem; border-bottom: 1px solid #1e1e2e;
  font-size: .88rem; font-weight: 600; color: #c8c8e0;
}
.edit-modal-body { padding: 1rem 1.25rem; overflow-y: auto; flex: 1; }
.edit-modal-footer {
  display: flex; justify-content: flex-end; gap: .5rem;
  padding: .8rem 1.25rem; border-top: 1px solid #1e1e2e;
}

.form-row { margin-bottom: .85rem; }
.form-row label { display: block; font-size: .73rem; color: #555570; margin-bottom: .3rem; }
.form-row.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
.field {
  width: 100%; padding: .4rem .65rem;
  background: #0e0e18; border: 1px solid #252535; border-radius: 6px;
  color: #c0c0d5; font-size: .82rem; outline: none; box-sizing: border-box;
}
.field:focus { border-color: #7c5cbf; }
.lyrics-area { resize: vertical; font-family: inherit; line-height: 1.55; }

.icon-close {
  background: none; border: none; cursor: pointer;
  color: #555570; font-size: .95rem; padding: 2px 6px; border-radius: 4px;
}
.icon-close:hover { color: #c0c0d5; }

.error-msg { color: #e06060; font-size: .78rem; margin-top: .5rem; }

.spinner.sm {
  width: 20px; height: 20px;
  border: 2px solid #252535; border-top-color: #7c5cbf;
  border-radius: 50%; animation: spin .7s linear infinite;
  display: inline-block; vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }

.btn-primary {
  background: #7c5cbf; color: #fff; border: none; border-radius: 6px;
  padding: .4rem .9rem; font-size: .8rem; cursor: pointer;
}
.btn-primary:hover:not(:disabled) { background: #9070d5; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-secondary {
  background: none; border: 1px solid #252535; color: #9090b0;
  border-radius: 6px; padding: .4rem .9rem; font-size: .8rem; cursor: pointer;
}
.btn-secondary:hover:not(:disabled) { color: #c0c0d5; }
.btn-secondary:disabled { opacity: .5; cursor: not-allowed; }
</style>
