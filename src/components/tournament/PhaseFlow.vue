<script setup lang="ts">
import { computed } from 'vue'

import { strings } from '@/lib/strings'
import type { Phase } from '@/stores/phases'

const props = defineProps<{ phases: readonly Phase[] }>()

const ordered = computed(() =>
  [...props.phases].sort((left, right) => left.position - right.position),
)

function advanceSummary(phase: Phase): string {
  const label = strings.phases.advanceLabels[phase.advance.type]
  if ('n' in phase.advance) return label.replace('N', String(phase.advance.n))
  return label
}

function tone(status: Phase['status']): string {
  if (status === 'open') return 'border-primary bg-primary/5'
  if (status === 'awaiting_resolution') return 'border-amber-300 bg-amber-50'
  if (status === 'closed') return 'border-emerald-300 bg-emerald-50'
  if (status === 'cancelled') return 'border-border bg-muted/30 opacity-60'
  return 'border-border bg-card'
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-end justify-between gap-3">
      <div class="space-y-1">
        <h3 class="text-base font-semibold">{{ strings.phases.flowTitle }}</h3>
        <p class="text-sm text-muted-foreground">{{ strings.phases.flowSubtitle }}</p>
      </div>
      <span class="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        {{ strings.phases.flowCount(ordered.length) }}
      </span>
    </div>

    <p
      v-if="ordered.length === 0"
      class="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground"
    >
      {{ strings.phases.flowEmpty }}
    </p>

    <div v-else class="overflow-x-auto pb-2" data-testid="phase-flow">
      <ol class="flex min-w-max items-stretch gap-2">
        <li
          v-for="(phase, index) in ordered"
          :key="phase.id"
          class="flex items-center gap-2"
        >
          <article
            class="w-44 rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md"
            :class="tone(phase.status)"
            :data-testid="`flow-phase-${phase.id}`"
          >
            <div class="mb-3 flex items-center justify-between gap-2">
              <span
                class="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
              >
                {{ phase.position }}
              </span>
              <span class="truncate rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                {{ strings.phases.statusLabels[phase.status] }}
              </span>
            </div>
            <p class="truncate text-sm font-semibold">{{ phase.name }}</p>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              {{ strings.phases.formulaLabels[phase.formula] }} ·
              {{ strings.phases.voteTypeLabels[phase.voteType] }}
            </p>
            <p class="mt-2 line-clamp-2 text-xs font-medium text-muted-foreground">
              {{ advanceSummary(phase) }}
            </p>
          </article>

          <span v-if="index < ordered.length - 1" class="text-muted-foreground" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="size-5"
            >
              <path d="M5 12h14" />
              <path d="m13 6 6 6-6 6" />
            </svg>
          </span>
        </li>
      </ol>
    </div>
  </section>
</template>
