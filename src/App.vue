<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="flex min-h-svh flex-col bg-background">
    <header class="border-b border-border">
      <div class="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-4">
        <span
          class="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
        >
          V
        </span>
        <span class="text-base font-semibold tracking-tight">Versus</span>
      </div>
    </header>

    <main class="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
