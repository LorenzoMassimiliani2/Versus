<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { strings } from '@/lib/strings'
import type { BallotTarget, RankingAssignment } from '@/stores/votes'

const props = defineProps<{
  target: BallotTarget
  disabled?: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [assignments: RankingAssignment[]]
  remove: []
}>()

const assignments = ref<RankingAssignment[]>([])

watch(
  () => props.target.vote,
  (vote) => {
    assignments.value =
      vote && vote.kind === 'ranking'
        ? vote.assignments.map((assignment) => ({ ...assignment }))
        : []
  },
  { immediate: true },
)

const remaining = computed(() =>
  props.target.points.scale.filter(
    (points) => !assignments.value.some((assignment) => assignment.points === points),
  ),
)

const ordered = computed(() =>
  [...assignments.value].sort((left, right) => right.points - left.points),
)

const voteDisabled = computed(() => props.disabled === true)
const canSave = computed(() => !voteDisabled.value && !props.saving)

function currentPoints(elementId: string): number | null {
  return assignments.value.find((assignment) => assignment.elementId === elementId)?.points ?? null
}

function availablePoints(elementId: string): number[] {
  const takenByOthers = new Set(
    assignments.value
      .filter((assignment) => assignment.elementId !== elementId)
      .map((assignment) => assignment.points),
  )
  return props.target.points.scale.filter((points) => !takenByOthers.has(points))
}

function nameOf(elementId: string): string {
  return props.target.elements.find((element) => element.elementId === elementId)?.name ?? elementId
}

function change(elementId: string, event: Event): void {
  if (voteDisabled.value) return
  const value = (event.target as HTMLSelectElement).value
  assignments.value = assignments.value.filter((assignment) => assignment.elementId !== elementId)
  if (value !== '') assignments.value.push({ elementId, points: Number(value) })
}
</script>

<template>
  <article class="space-y-3 rounded-md border border-border p-3">
    <header class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-lg font-semibold">{{ target.name }}</h2>
      <p :id="`ranking-remaining-${target.id}`" class="text-sm font-medium">
        {{ strings.voting.pointsRemaining(remaining.length) }}
      </p>
    </header>

    <p v-if="remaining.length === 0" class="text-sm text-muted-foreground">
      {{ strings.voting.pointsNone }}
    </p>
    <div v-else class="flex flex-wrap gap-1" :aria-label="strings.voting.pointsLabel">
      <span
        v-for="points in remaining"
        :key="points"
        class="rounded-full border border-border px-2 py-0.5 text-xs font-medium"
      >
        {{ points }}
      </span>
    </div>

    <ul class="space-y-2">
      <li
        v-for="element in target.elements"
        :key="element.elementId"
        class="flex items-center justify-between gap-3"
      >
        <span class="text-sm font-medium">{{ element.name }}</span>
        <select
          :id="`rank-points-${element.elementId}`"
          class="h-11 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60"
          :value="currentPoints(element.elementId) ?? ''"
          :disabled="voteDisabled"
          :aria-label="`${strings.voting.pointsLabel} ${element.name}`"
          @change="change(element.elementId, $event)"
        >
          <option value="">{{ strings.voting.pointsUnassigned }}</option>
          <option v-for="points in availablePoints(element.elementId)" :key="points" :value="points">
            {{ points }}
          </option>
        </select>
      </li>
    </ul>

    <ol
      v-if="ordered.length > 0"
      :id="`ranking-order-${target.id}`"
      class="space-y-1 text-sm"
    >
      <li v-for="(assignment, index) in ordered" :key="assignment.elementId">
        {{ index + 1 }}. {{ nameOf(assignment.elementId) }} — {{ assignment.points }}
      </li>
    </ol>

    <div class="flex flex-wrap gap-2">
      <button
        :id="`save-ranking-${target.id}`"
        class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        type="button"
        :disabled="!canSave"
        @click="emit('save', assignments)"
      >
        {{ saving ? strings.voting.saving : strings.voting.save }}
      </button>
      <button
        v-if="target.vote"
        :id="`remove-ranking-${target.id}`"
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
