<template>
  <div style="min-height:100vh;background:#0f0f13;color:#e0e0ee">
    <NavBar />
    <RouterView />
  </div>
</template>

<script setup>
import NavBar from './components/NavBar.vue'
</script>
