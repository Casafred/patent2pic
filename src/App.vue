<template>
  <div class="app-container">
    <TitleBar />
    <div class="app-body">
      <AppLayout />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import TitleBar from './components/layout/TitleBar.vue'
import AppLayout from './components/layout/AppLayout.vue'
import { useAutoSave } from '@/composables/useAutoSave'

const { registerBeforeUnload, loadFromLocalStorage, startIntervalSave } = useAutoSave()

let cleanupBeforeUnload: (() => void) | null = null
let cleanupInterval: (() => void) | null = null

onMounted(() => {
  // Hide splash screen after app is mounted
  const splash = document.getElementById('splash-screen')
  if (splash) {
    splash.classList.add('fade-out')
    setTimeout(() => splash.remove(), 600)
  }

  cleanupBeforeUnload = registerBeforeUnload()
  cleanupInterval = startIntervalSave()
  setTimeout(() => {
    loadFromLocalStorage()
  }, 300)
})

onUnmounted(() => {
  cleanupBeforeUnload?.()
  cleanupInterval?.()
})
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
}

.app-body {
  flex: 1;
  overflow: hidden;
}
</style>
