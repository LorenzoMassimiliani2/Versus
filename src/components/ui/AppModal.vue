<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

import { strings } from '@/lib/strings'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = open ? 'hidden' : ''
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
    @click.self="emit('close')"
  >
    <div
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      class="max-h-[90svh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-4 shadow-xl"
    >
      <div class="mb-4 flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold tracking-tight">{{ title }}</h2>
        <button
          class="flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-xl leading-none"
          type="button"
          :aria-label="strings.common.close"
          @click="emit('close')"
        >
          ×
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>
