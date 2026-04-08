<template>
  <!-- Paths section – shown when creating, cover-only when editing -->
  <template v-if="showPath">
    <div class="modal-section-label">Paths</div>
    <div class="modal-row">
      <div class="field-group flex-1">
        <label class="field-label">Folder Path <span class="req">*</span></label>
        <input v-model="form.path" type="text" class="field" placeholder="relative to media source root" />
      </div>
      <!-- Video Collection: cover auto-generated from first frame; Music/Document Collection: optional upload -->
      <template v-if="mediatypeType !== 2">
        <div class="field-group flex-1">
          <label class="field-label">Cover Image</label>
          <template v-if="mediatypeType === 3 || mediatypeType === 4">
            <label class="cover-upload-btn">
              <input type="file" accept="image/*" style="display:none" @change="onCoverFileChange" />
              <span>{{ coverFileName || 'Choose image… (optional)' }}</span>
            </label>
            <span v-if="coverFileName" style="font-size:.68rem;color:#555570;margin-top:.2rem">Will be saved as cover.jpg</span>
          </template>
          <input v-else v-model="form.cover" type="text" class="field" placeholder="filename, abs path, or URL" />
        </div>
      </template>
    </div>
  </template>
  <template v-else>
    <div class="modal-section-label">Cover</div>
    <div class="modal-row">
      <div class="field-group flex-1">
        <label class="field-label">Cover Image</label>
        <!-- Video / Music / Document: file upload; will be saved as cover.jpg on the server -->
        <template v-if="mediatypeType === 2 || mediatypeType === 3 || mediatypeType === 4">
          <label class="cover-upload-btn">
            <input type="file" accept="image/*" style="display:none" @change="onCoverFileChange" />
            <span>{{ coverFileName || 'Choose image…' }}</span>
          </label>
          <span v-if="coverFileName" style="font-size:.68rem;color:#555570;margin-top:.2rem">Will be saved as cover.jpg</span>
        </template>
        <input v-else v-model="form.cover" type="text" class="field" placeholder="filename, abs path, or URL" />
      </div>
    </div>
  </template>

  <div class="modal-section-label" style="margin-top:1rem">Identity</div>
  <div class="modal-row">
    <div class="field-group flex-1">
      <label class="field-label">Title <span class="req">*</span></label>
      <input v-model="form.title" type="text" class="field" />
    </div>
    <div class="field-group flex-1">
      <label class="field-label">Original Title</label>
      <input v-model="form.original_title" type="text" class="field" />
    </div>
  </div>
  <div class="modal-row" style="margin-top:.5rem">
    <div class="field-group flex-1">
      <label class="field-label">
        {{ artistLabel }}
        <span v-if="mediatypeType === 1 || mediatypeType === 2" class="req">*</span>
      </label>
      <input v-model="form.artist" type="text" class="field" />
    </div>
    <div class="field-group flex-1">
      <label class="field-label">
        {{ circleLabel }}
        <span v-if="mediatypeType === 1 || mediatypeType === 2" class="req">*</span>
      </label>
      <input v-model="form.series" type="text" class="field" />
    </div>
  </div>
  <p v-if="showPath && (mediatypeType === 1 || mediatypeType === 2)" style="font-size:.72rem;color:#555570;margin:.35rem 0 0">
    At least one of {{ artistLabel }} or {{ circleLabel }} is required — used to build the folder path.
  </p>

  <div class="modal-section-label" style="margin-top:1rem">Classification</div>
  <div class="modal-row" style="gap:1.5rem">
    <div class="field-group">
      <label class="field-label">Content Rating</label>
      <select v-model="form.content_rating" class="field">
        <option value="general">General</option>
        <option value="sensitive">Sensitive</option>
        <option value="questionable">Questionable</option>
        <option value="explicit">Explicit</option>
      </select>
    </div>
    <div class="field-group">
      <label class="field-label">Score</label>
      <div class="stars-row">
        <button v-for="n in 5" :key="n" type="button" class="star-btn"
          :class="{ active: n <= form.rating }"
          @click="form.rating = form.rating === n ? null : n">
          &#9733;
        </button>
        <span class="star-label">{{ form.rating ? form.rating + ' / 5' : 'none' }}</span>
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">Language</label>
      <input v-model="form.language" type="text" class="field" style="width:120px" placeholder="e.g. Japanese" />
    </div>
  </div>

  <!-- Image Collection -->
  <template v-if="mediatypeType === 1">
    <div class="modal-section-label" style="margin-top:1rem">Image Collection</div>
    <div class="modal-row">
      <div class="field-group">
        <label class="field-label">Page Count</label>
        <input v-model.number="form.page_count" type="number" min="1" class="field" style="width:100px" />
      </div>
      <div class="field-group flex-1">
        <label class="field-label">Source URL</label>
        <input v-model="form.source_url" type="text" class="field" placeholder="https://..." />
      </div>
    </div>
  </template>

  <!-- Video Collection -->
  <template v-if="mediatypeType === 2">
    <div class="modal-section-label" style="margin-top:1rem">Video Collection</div>
    <div class="modal-row">
      <div class="field-group">
        <label class="field-label">Video Count</label>
        <input v-model.number="form.track_count" type="number" min="0" class="field" style="width:100px" readonly />
      </div>
      <div class="field-group flex-1">
        <label class="field-label">Source URL</label>
        <input v-model="form.source_url" type="text" class="field" placeholder="https://..." />
      </div>
    </div>
  </template>

  <!-- Music Collection -->
  <template v-if="mediatypeType === 3">
    <div class="modal-section-label" style="margin-top:1rem">Music Collection</div>
    <div class="modal-row">
      <div class="field-group">
        <label class="field-label">Duration (sec)</label>
        <input v-model.number="form.duration" type="number" min="0" class="field" style="width:120px" />
      </div>
      <div class="field-group">
        <label class="field-label">Track Count</label>
        <input v-model.number="form.track_count" type="number" min="1" class="field" style="width:100px" />
      </div>
    </div>
  </template>

  <div class="modal-section-label" style="margin-top:1rem">Summary</div>
  <textarea v-model="form.summary" class="field" rows="3" style="width:100%;resize:vertical" placeholder="Short description…"></textarea>

  <div class="modal-section-label" style="margin-top:1rem">Notes</div>
  <textarea v-model="form.notes" class="field" rows="2" style="width:100%;resize:vertical" placeholder="Internal notes…"></textarea>

  <div class="modal-section-label" style="margin-top:1rem">
    Tags
    <span class="section-sub">click to remove</span>
  </div>
  <div class="tags-wrap" style="margin-bottom:.5rem">
    <button v-for="t in form.tags" :key="t.tag" type="button" class="tag-chip tag-rm" @click="removeTag(t.tag)">
      {{ t.tag }}<em v-if="t.score"> {{ (t.score * 100).toFixed(0) }}%</em>
    </button>
  </div>
  <div class="tag-add-row">
    <input
      v-model="newTagInput"
      type="text"
      class="field tag-add-input"
      placeholder="Add custom tag…"
      @keydown.enter.prevent="addTag"
    />
    <button type="button" class="btn-secondary tag-add-btn" @click="addTag">Add</button>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  form: { type: Object, required: true },
  mediatypeType: { type: Number, default: null },
  showPath: { type: Boolean, default: true },
})

const emit = defineEmits(['cover-file'])

const coverFileName = ref('')

function onCoverFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return
  coverFileName.value = file.name
  emit('cover-file', file)
}

// Artist and circle/series labels vary by media type
const artistLabel = computed(() => (props.mediatypeType === 1 || props.mediatypeType === 3) ? 'Artist' : 'Author')
const circleLabel = computed(() => props.mediatypeType === 1 ? 'Circle' : 'Series')

const newTagInput = ref('')

function addTag() {
  const name = newTagInput.value.trim().replace(/\s+/g, '_')
  if (!name) return
  if (props.form.tags.some(t => t.tag.toLowerCase() === name.toLowerCase())) {
    newTagInput.value = ''
    return
  }
  props.form.tags.push({ tag: name, score: 0 })
  newTagInput.value = ''
}

function removeTag(tagName) {
  const idx = props.form.tags.findIndex(t => t.tag === tagName)
  if (idx !== -1) props.form.tags.splice(idx, 1)
}
</script>

<style scoped>
.modal-section-label {
  font-size: .68rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  color: #333346; margin-bottom: .5rem; display: flex; align-items: center; gap: .5rem;
}
.modal-row { display: flex; gap: .75rem; flex-wrap: wrap; }
.flex-1 { flex: 1; min-width: 0; }
.req { color: #f87171; }
.field-group { display: flex; flex-direction: column; gap: .3rem; }
.field-label  { font-size: .72rem; color: #666680; }

.cover-upload-btn {
  display: inline-flex; align-items: center;
  padding: .35rem .75rem; border-radius: 6px;
  border: 1px dashed #333348; background: #0f0f1a;
  color: #8080a8; font-size: .78rem; cursor: pointer;
  transition: border-color .12s, color .12s;
}
.cover-upload-btn:hover { border-color: #7c5cbf; color: #b090e8; }

.stars-row { display: flex; align-items: center; gap: .2rem; }
.star-btn {
  background: none; border: none; font-size: 1.6rem; cursor: pointer;
  color: #2a2a3a; line-height: 1; padding: 0 .05rem; transition: color .1s;
}
.star-btn.active { color: #fbbf24; }
.star-btn:hover  { color: #fbbf2488; }
.star-label { font-size: .78rem; color: #444458; margin-left: .5rem; }

.section-sub { font-weight: 400; text-transform: none; letter-spacing: 0; color: #333346; }

.tags-wrap { display: flex; flex-wrap: wrap; gap: .35rem; }
.tag-chip {
  display: inline-flex; align-items: center; gap: .3rem;
  background: #1e1e2a; border: 1px solid #252535; border-radius: 4px;
  padding: 2px 7px; font-size: .72rem; color: #888899;
}
.tag-chip em { font-style: normal; color: #444458; font-size: .68rem; }
.tag-rm { background: none; cursor: pointer; }
.tag-rm:hover { border-color: #f8717144; color: #f87171; }

.tag-add-row { display: flex; gap: .5rem; margin-top: .35rem; align-items: center; }
.tag-add-input { flex: 1; max-width: 260px; }
.tag-add-btn { padding: .35rem .75rem; font-size: .78rem; }
</style>
