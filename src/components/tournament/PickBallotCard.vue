<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { strings } from '@/lib/strings'
import type { BallotTarget } from '@/stores/votes'

const props = defineProps<{
  target: BallotTarget
  disabled?: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [elementId: string]
  remove: []
}>()

const selected = ref<string | null>(null)

watch(
  () => props.target.vote,
  (vote) => {
    selected.value = vote && vote.kind === 'pick' ? vote.elementId : null
  },
  { immediate: true },
)

const voteDisabled = computed(() => props.disabled === true)
const canSave = computed(() => !voteDisabled.value && !props.saving && selected.value !== null)

function pick(elementId: string): void {
  if (voteDisabled.value) return
  selected.value = elementId
}
</script>

<template>
  <article class="space-y-3 rounded-md border border-border p-3">
    <header>
      <h2 class="text-lg font-semibold">{{ target.name }}</h2>
      <p class="text-sm text-muted-foreground">{{ strings.voting.subtitlePick }}</p>
    </header>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button
        v-for="element in target.elements"
        :id="`pick-element-${element.elementId}`"
        :key="element.elementId"
        class="flex items-center gap-3 rounded-md border p-2 text-left disabled:opacity-60"
        :class="selected === element.elementId ? 'border-primary bg-primary/10' : 'border-border'"
        type="button"
        :disabled="voteDisabled"
        :aria-pressed="selected === element.elementId"
        @click="pick(element.elementId)"
      >
        <img
          :src="element.imageUrl"
          :alt="element.name"
          class="h-16 w-16 rounded-md object-cover"
          loading="lazy"
        />
        <span class="text-sm font-medium">{{ element.name }}</span>
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        :id="`save-pick-${target.id}`"
        class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        type="button"
        :disabled="!canSave"
        @click="selected !== null && emit('save', selected)"
      >
        {{ saving ? strings.voting.saving : strings.voting.save }}
      </button>
      <button
        v-if="target.vote"
        :id="`remove-pick-${target.id}`"
        class="h-11 rounded-md border border-destructive px-4 text-sm font-medium text-destructive disabled:opacity-60"
        type="button"
        :disabled="voteDisabled || saving"
        @click="emit('remove')"
      >
        {{ strings.voting.remove }}
      </button>
    </div>
  </article>
</template>
