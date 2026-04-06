<template>
  <div class="flex items-center gap-2" style="font-size:.75rem;color:#666680">
    <span class="dot" :class="state"></span>
    {{ label }}
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { API_BASE } from '../api.js'

const state = ref('wait')
const label = ref('connecting…')
let timer

async function check() {
  try {
    const r = await fetch(`${API_BASE}/`)
    if (!r.ok) throw new Error()
    state.value = 'ok'
    label.value = 'API online'
  } catch {
    state.value = 'err'
    label.value = 'API offline'
  }
}

onMounted(() => { check(); timer = setInterval(check, 30000) })
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ok   { background: #34d399; box-shadow: 0 0 6px #34d39955; }
.err  { background: #f87171; }
.wait { background: #fbbf24; animation: pulse 1.4s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
</style>
