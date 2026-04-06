<template>
  <header class="navbar">
    <RouterLink to="/" class="brand">
      <ImageIcon :size="18" />{{ title }}
    </RouterLink>
    <div class="flex items-center gap-4">
      <ApiStatus />
      <button v-if="!isAdmin" class="btn-secondary" style="font-size:.82rem" @click="$router.push('/indexfolder')">
        <FolderInput :size="14" /><span>Add Media</span>
      </button>
      <button v-if="!isAdmin" class="btn-secondary" style="font-size:.82rem" @click="$router.push('/admin')">
        <Settings :size="14" /><span>Administration</span>
      </button>
      <button v-else class="btn-secondary" style="font-size:.82rem" @click="$router.push('/')">
        <ArrowLeft :size="14" /><span>Back to Library</span>
      </button>
    </div>
  </header>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Image as ImageIcon, Settings, ArrowLeft, FolderInput } from 'lucide-vue-next'
import ApiStatus from './ApiStatus.vue'

const route   = useRoute()
const title   = ref('Coatl')
const isAdmin = ref(false)

async function loadTitle() {
  try {
    const cfg = await fetch('/config').then(r => r.json())
    title.value = cfg.site?.title || 'Coatl'
  } catch { /* keep default */ }
}

function updateAdmin(p) {
  isAdmin.value = p.startsWith('/admin') || p.startsWith('/serverconfig')
}

watch(() => route.path, updateAdmin)
onMounted(() => { loadTitle(); updateAdmin(route.path) })
</script>

<style scoped>
.navbar {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  background: #111118;
  border-bottom: 1px solid #1a1a28;
  position: sticky;
  top: 0;
  z-index: 100;
}
.brand {
  display: flex;
  align-items: center;
  gap: .5rem;
  color: #7c5cbf;
  text-decoration: none;
  font-weight: 600;
  font-size: 1.05rem;
  letter-spacing: .04em;
  transition: color .15s;
}
.brand:hover { color: #9b7fe0; }
</style>
