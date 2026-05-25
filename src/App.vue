<template>
  <div class="app-container">
    <TitleBar />
    <div class="app-body">
      <AppLayout />
    </div>
  </div>
</template>

<script setup lang="ts">
import TitleBar from './components/layout/TitleBar.vue'
import AppLayout from './components/layout/AppLayout.vue'
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
