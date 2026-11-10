
<script setup lang="ts">
import SectionCard from '@/components/ui/SectionCard.vue'
import { onMounted } from 'vue'

import type { PlanIssue, PlanMatchPreview, PlanPhasePreview } from '@/domain/plan'
import { planIssueMessage, strings } from '@/lib/strings'
import { usePlanPreviewStore } from '@/stores/plan-preview'

const props = defineProps<{ tournamentId: string }>()

const store = usePlanPreviewStore()

onMounted(() => {
  void store.load(props.tournamentId)
})

function issueLabel(issue: PlanIssue): string {
  const message = planIssueMessage(issue.code)
  if (issue.phase === undefined) return message
  return `${strings.planPreview.phase(issue.phase, issue.phaseName ?? '')}: ${message}`
}

function matchLabel(match: PlanMatchPreview): string {
  if (match.a && match.b) return `${match.a.name} vs ${match.b.name}`
  const single = match.a ?? match.b
  return single ? `${single.name} (${strings.planPreview.byeMatch})` : strings.planPreview.byeMatch
}

function qualifiesLabel(phase: PlanPhasePreview): string {
  const parts = [`${phase.qualified.direct} ${strings.planPreview.direct}`]
  if (phase.qualified.repechage > 0) {
    parts.push(`${phase.qualified.repechage} ${strings.planPreview.repechage}`)
  }
  return parts.join(' + ')
}
</script>

<template>
  <SectionCard class="space-y-4" data-testid="plan-preview-panel">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="space-y-1">
        <h2 class="text-base font-semibold">{{ strings.planPreview.title }}</h2>
        <p class="text-sm text-muted-foreground">{{ strings.planPreview.subtitle }}</p>
      </div>
      <button
        class="h-9 rounded-md border border-border px-3 text-sm disabled:opacity-60"
        type="button"
        :disabled="store.loading"
        @click="store.load(tournamentId)"
      >
        {{ store.loading ? strings.planPreview.refreshing : strings.planPreview.refresh }}
      </button>
    </div>

    <p v-if="store.error" class="text-sm text-destructive" role="alert">{{ store.error }}</p>
    <p v-if="store.loading && !store.result" class="text-sm text-muted-foreground">
      {{ strings.planPreview.loading }}
    </p>

    <template v-if="store.result">
      <p
        class="inline-block rounded-full px-3 py-1 text-sm font-medium"
        :class="
          store.result.valid
            ? 'bg-emerald-100 text-emerald-900'
            : 'bg-destructive/10 text-destructive'
        "
        data-testid="plan-validity"
      >
        {{ store.result.valid ? strings.planPreview.valid : strings.planPreview.invalid }}
      </p>

      <div class="space-y-2">
        <h3 class="text-sm font-semibold">{{ strings.planPreview.errorsTitle }}</h3>
        <p v-if="store.result.errors.length === 0" class="text-sm text-muted-foreground">
          {{ strings.planPreview.noErrors }}
        </p>
        <ul v-else class="space-y-1 text-sm text-destructive" data-testid="plan-errors">
          <li v-for="(issue, index) in store.result.errors" :key="`${issue.code}-${index}`">
            {{ issueLabel(issue) }}
          </li>
        </ul>
      </div>

      <div class="space-y-2">
        <h3 class="text-sm font-semibold">{{ strings.planPreview.warningsTitle }}</h3>
        <p v-if="store.result.warnings.length === 0" class="text-sm text-muted-foreground">
          {{ strings.planPreview.noWarnings }}
        </p>
        <ul v-else class="space-y-1 text-sm text-amber-700" data-testid="plan-warnings">
          <li v-for="(issue, index) in store.result.warnings" :key="`${issue.code}-${index}`">
            {{ issueLabel(issue) }}
          </li>
        </ul>
      </div>

      <div class="space-y-2">
        <h3 class="text-sm font-semibold">{{ strings.planPreview.structureTitle }}</h3>
        <ol class="space-y-3" data-testid="plan-structure">
          <li
            v-for="phase in store.result.preview.phases"
            :key="phase.position"
            class="space-y-1 rounded-md border border-border p-3 text-sm"
          >
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium">
                {{ strings.planPreview.phase(phase.position, phase.name) }}
              </span>
              <span class="text-xs text-muted-foreground">
                {{ strings.planPreview.input }}: {{ phase.inputCount }} ·
                {{ strings.planPreview.output }}: {{ phase.outputCount }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">{{ qualifiesLabel(phase) }}</p>

            <div v-if="phase.groups.length > 0">
              <span class="text-xs font-medium">{{ strings.planPreview.groups }}</span>
              <ul class="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li v-for="group in phase.groups" :key="group.name">
                  {{ group.name }}:
                  {{ group.members.map((member) => member.name).join(', ') }}
                </li>
              </ul>
            </div>
            <p v-else-if="phase.formula === 'group'" class="text-xs text-muted-foreground">
              {{ strings.planPreview.noGroups }}
            </p>

            <p v-if="phase.byes.length > 0" class="text-xs text-muted-foreground">
              {{ strings.planPreview.byes }}:
              {{ phase.byes.map((bye) => bye.name).join(', ') }}
            </p>

            <div v-if="phase.matches.length > 0">
              <span class="text-xs font-medium">{{ strings.planPreview.matches }}</span>
              <ul class="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li v-for="(match, index) in phase.matches" :key="index">
                  {{ matchLabel(match) }}
                </li>
              </ul>
            </div>
          </li>
        </ol>
      </div>
    </template>
  </SectionCard>
</template>
