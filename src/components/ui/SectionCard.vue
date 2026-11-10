<script setup lang="ts">
defineProps<{
  title?: string
  subtitle?: string
}>()
</script>

<template>
  <section class="rounded-2xl bg-muted/20 p-5">
    <header
      v-if="title || $slots.actions"
      class="mb-4 flex flex-wrap items-start justify-between gap-3"
    >
      <div v-if="title" class="space-y-1">
        <h2 class="text-base font-semibold">{{ title }}</h2>
        <p v-if="subtitle" class="text-sm text-muted-foreground">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="flex shrink-0 gap-2">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </section>
</template>
