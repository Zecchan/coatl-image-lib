<template>
  <div style="max-width:1400px;margin:0 auto;padding:1.5rem 1.25rem">

    <!-- Back -->
    <button class="btn-secondary back-btn" @click="$router.back()">
      <ChevronLeft :size="14" /> Back
    </button>

    <!-- Loading -->
    <div v-if="loading" class="state-center" style="padding:5rem 0">
      <div class="spinner"></div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="state-center" style="padding:5rem 0;color:#e05050">{{ error }}</div>

    <template v-else-if="media">
      <!-- Common header -->
      <MediaHeader :media="media" @tag-click="onTagClick" @updated="onMediaUpdated" />

      <!-- Type-specific content -->

      <!-- Type 1: Image Collection -->
      <ImageCollectionView v-if="media.mediatypeType === 1" :media="media" />

      <!-- Type 2: Video Collection -->
      <VideoCollectionView v-else-if="media.mediatypeType === 2" :media="media" />

      <!-- Type 3: Music Collection -->
      <MusicCollectionView v-else-if="media.mediatypeType === 3" :media="media" />

      <!-- Fallback for unsupported types -->
      <div v-else class="state-center" style="padding:3rem 0;color:#555570;font-size:.85rem">
        No viewer available for media type "{{ media.mediatypeName }}".
      </div>
    </template>

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronLeft } from 'lucide-vue-next'
import MediaHeader from '../components/MediaHeader.vue'
import ImageCollectionView from '../components/ImageCollectionView.vue'
import VideoCollectionView from '../components/VideoCollectionView.vue'
import MusicCollectionView from '../components/MusicCollectionView.vue'

const route  = useRoute()
const router = useRouter()

const media   = ref(null)
const loading = ref(true)
const error   = ref('')

onMounted(async () => {
  try {
    const res = await fetch(`/db/medias/${route.params.uid}`)
    if (!res.ok) { error.value = res.status === 404 ? 'Media not found.' : 'Failed to load media.'; return }
    media.value = await res.json()
    const { getSiteName } = await import('../main.js')
    document.title = `${media.value.title} — ${getSiteName()}`
  } catch {
    error.value = 'Could not reach the server.'
  } finally {
    loading.value = false
  }
})

function onTagClick(name, e) {
  // Navigate home with the tag pre-filled in search
  router.push({ path: '/', query: { q: `$${name}` } })
}

function onMediaUpdated(updated) {
  media.value = updated
  const sep = document.title.indexOf(' — ')
  if (sep !== -1) document.title = updated.title + document.title.slice(sep)
  else document.title = updated.title
}
</script>

<style scoped>
.back-btn { margin-bottom: 1.25rem; }

.state-center { display: flex; justify-content: center; }

/* Spinner */
.spinner {
  width: 2rem; height: 2rem; border-radius: 50%;
  border: 3px solid #252535; border-top-color: #7c5cbf;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
