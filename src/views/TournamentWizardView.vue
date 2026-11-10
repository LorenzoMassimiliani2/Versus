<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import BackLink from '@/components/ui/BackLink.vue'
import CustomFieldsPanel from '@/components/tournament/CustomFieldsPanel.vue'
import ElementsPanel from '@/components/tournament/ElementsPanel.vue'
import ParticipantsPanel from '@/components/tournament/ParticipantsPanel.vue'
import PhaseFlow from '@/components/tournament/PhaseFlow.vue'
import PhasesPanel from '@/components/tournament/PhasesPanel.vue'
import PlanPreviewPanel from '@/components/tournament/PlanPreviewPanel.vue'
import { planIssueMessage, strings, tournamentStatusLabel } from '@/lib/strings'
import { useElementsStore } from '@/stores/elements'
import { usePhasesStore } from '@/stores/phases'
import { usePlanPreviewStore } from '@/stores/plan-preview'
import { useTournamentsStore } from '@/stores/tournaments'

const STEPS = ['details', 'fields', 'elements', 'participants', 'plan', 'preview', 'publish'] as const
type Step = (typeof STEPS)[number]

const route = useRoute()
const tournaments = useTournamentsStore()
const elements = useElementsStore()
const phases = usePhasesStore()
const preview = usePlanPreviewStore()

const tournamentId = computed(() => String(route.params.id))
const step = ref<Step>('details')

const editName = ref('')
const editDescription = ref('')
const editCoverUrl = ref('')
const editSelfVoteAllowed = ref(true)
const editAutoAdvance = ref(false)
const detailsSaved = ref(false)

const isOrganizer = computed(
  () => tournaments.current?.role === 'owner' || tournaments.current?.role === 'co_organizer',
)
const isDraft = computed(() => tournaments.current?.status === 'draft')
const settingsLocked = computed(() =>
  phases.phases.some((phase) => phase.status !== 'pending' && phase.status !== 'cancelled'),
)
const canPublish = computed(
  () => !tournaments.publishing && preview.result?.valid === true && isDraft.value,
)

onMounted(async () => {
  await tournaments.loadOne(tournamentId.value)
  syncForm()
  if (isOrganizer.value) {
    await Promise.all([elements.load(tournamentId.value), phases.load(tournamentId.value)])
  }
})

function syncForm(): void {
  const tournament = tournaments.current
  if (!tournament) return
  editName.value = tournament.name
  editDescription.value = tournament.description
  editCoverUrl.value = tournament.coverUrl ?? ''
  editSelfVoteAllowed.value = tournament.settings.selfVoteAllowed
  editAutoAdvance.value = tournament.settings.autoAdvance
}

async function saveDetails(): Promise<void> {
  detailsSaved.value = false
  const ok = await tournaments.update(tournamentId.value, {
    name: editName.value,
    description: editDescription.value,
    coverUrl: editCoverUrl.value.trim() ? editCoverUrl.value.trim() : null,
    settings: {
      selfVoteAllowed: editSelfVoteAllowed.value,
      autoAdvance: editAutoAdvance.value,
    },
  })
  if (ok) detailsSaved.value = true
}

async function goTo(next: Step): Promise<void> {
  step.value = next
  if (next === 'preview' || next === 'publish') {
    await preview.load(tournamentId.value)
  }
}

function stepIndex(): number {
  return STEPS.indexOf(step.value)
}

async function next(): Promise<void> {
  const index = stepIndex() + 1
  if (index < STEPS.length) await goTo(STEPS[index]!)
}

async function previous(): Promise<void> {
  const index = stepIndex() - 1
  if (index >= 0) await goTo(STEPS[index]!)
}

async function submitPublish(): Promise<void> {
  if (!canPublish.value) return
  const ok = await tournaments.publish(tournamentId.value)
  if (ok) step.value = 'publish'
}
</script>

<template>
  <section class="space-y-6" data-testid="tournament-wizard">
    <div class="space-y-1">
      <div class="flex items-center gap-2">
        <BackLink
          :to="{ name: 'tournament', params: { id: tournamentId } }"
          :label="strings.wizard.back"
        />
        <h1 class="text-2xl font-semibold tracking-tight">{{ strings.wizard.title }}</h1>
      </div>
      <p class="text-sm text-muted-foreground">{{ strings.wizard.subtitle }}</p>
    </div>

    <p v-if="tournaments.error && !tournaments.current" class="text-sm text-destructive" role="alert">
      {{ tournaments.error }}
    </p>
    <p v-if="tournaments.loading && !tournaments.current" class="text-sm text-muted-foreground">
      {{ strings.tournaments.loading }}
    </p>

    <template v-if="tournaments.current">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-lg font-semibold">{{ tournaments.current.name }}</h2>
        <span class="rounded-full border border-border px-2 py-0.5 text-xs">
          {{ tournamentStatusLabel(tournaments.current.status) }}
        </span>
      </div>

      <section
        v-if="isOrganizer && !isDraft"
        class="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-4"
        data-testid="wizard-published"
      >
        <h2 class="text-base font-semibold text-emerald-900">
          {{ strings.wizard.publishedTitle }}
        </h2>
        <p class="text-sm text-emerald-900">{{ strings.wizard.publishedBody }}</p>
        <RouterLink
          class="inline-block h-11 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
          :to="{ name: 'tournament', params: { id: tournamentId } }"
        >
          {{ strings.wizard.goToTournament }}
        </RouterLink>
      </section>

      <template v-else-if="isOrganizer && isDraft">
        <nav
          class="overflow-x-auto pb-1"
          :aria-label="strings.wizard.stepsLabel"
          data-testid="wizard-steps"
        >
          <div class="flex min-w-max items-center gap-1.5">
            <template v-for="(item, index) in STEPS" :key="item">
              <button
                class="flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors"
                :class="
                  step === item
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground'
                "
                type="button"
                :data-testid="`wizard-step-${item}`"
                :aria-current="step === item ? 'step' : undefined"
                @click="goTo(item)"
              >
                <span
                  class="flex size-6 items-center justify-center rounded-full text-xs font-semibold"
                  :class="step === item ? 'bg-primary-foreground/20' : 'bg-muted'"
                >
                  {{ index + 1 }}
                </span>
                {{ strings.wizard.steps[item] }}
              </button>
              <span
                v-if="index < STEPS.length - 1"
                class="h-px w-4 shrink-0 bg-border"
                aria-hidden="true"
              />
            </template>
          </div>
        </nav>

        <div class="space-y-3 rounded-md border border-border p-4">
          <template v-if="step === 'details'">
            <h3 class="text-base font-semibold">{{ strings.wizard.detailsTitle }}</h3>
            <form id="wizard-details-form" class="space-y-3" @submit.prevent="saveDetails">
              <div class="space-y-1.5">
                <label class="text-sm font-medium" for="wizard-name">
                  {{ strings.tournamentDetail.name }}
                </label>
                <input
                  id="wizard-name"
                  v-model="editName"
                  class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  type="text"
                  maxlength="120"
                  required
                />
              </div>

              <div class="space-y-1.5">
                <label class="text-sm font-medium" for="wizard-description">
                  {{ strings.tournamentDetail.description }}
                </label>
                <textarea
                  id="wizard-description"
                  v-model="editDescription"
                  class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  maxlength="2000"
                />
              </div>

              <div class="space-y-1.5">
                <label class="text-sm font-medium" for="wizard-cover">
                  {{ strings.tournamentDetail.coverUrl }}
                </label>
                <input
                  id="wizard-cover"
                  v-model="editCoverUrl"
                  class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  type="url"
                  inputmode="url"
                />
              </div>

              <fieldset class="space-y-2 rounded-md border border-border p-3">
                <legend class="px-1 text-sm font-medium">{{ strings.wizard.settingsTitle }}</legend>
                <label class="flex items-start gap-2 text-sm">
                  <input
                    id="wizard-self-vote"
                    v-model="editSelfVoteAllowed"
                    class="mt-0.5 size-4"
                    type="checkbox"
                    :disabled="settingsLocked"
                  />
                  <span>{{ strings.wizard.selfVoteAllowed }}</span>
                </label>
                <label class="flex items-start gap-2 text-sm">
                  <input
                    id="wizard-auto-advance"
                    v-model="editAutoAdvance"
                    class="mt-0.5 size-4"
                    type="checkbox"
                    :disabled="settingsLocked"
                  />
                  <span>{{ strings.wizard.autoAdvance }}</span>
                </label>
                <p v-if="settingsLocked" class="text-sm text-muted-foreground">
                  {{ strings.wizard.settingsLocked }}
                </p>
              </fieldset>

              <p v-if="tournaments.error" class="text-sm text-destructive" role="alert">
                {{ tournaments.error }}
              </p>
              <p v-if="detailsSaved" class="text-sm text-muted-foreground" role="status">
                {{ strings.wizard.detailsSaved }}
              </p>

              <button
                class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                type="submit"
                :disabled="tournaments.saving"
              >
                {{ tournaments.saving ? strings.wizard.savingDetails : strings.wizard.saveDetails }}
              </button>
            </form>
          </template>

          <ElementsPanel v-else-if="step === 'elements'" :tournament-id="tournamentId" />
          <CustomFieldsPanel v-else-if="step === 'fields'" :tournament-id="tournamentId" />
          <ParticipantsPanel
            v-else-if="step === 'participants'"
            :tournament-id="tournamentId"
            :editable="true"
          />
          <div v-else-if="step === 'plan'" class="space-y-5">
            <PhaseFlow :phases="phases.phases" />
            <PhasesPanel :tournament-id="tournamentId" :editable="true" />
          </div>
          <PlanPreviewPanel v-else-if="step === 'preview'" :tournament-id="tournamentId" />

          <div v-else-if="step === 'publish'" class="space-y-4" data-testid="wizard-publish">
            <div class="space-y-1">
              <h3 class="text-base font-semibold">{{ strings.wizard.publishTitle }}</h3>
              <p class="text-sm text-muted-foreground">{{ strings.wizard.publishSubtitle }}</p>
            </div>

            <p v-if="preview.loading" class="text-sm text-muted-foreground">
              {{ strings.planPreview.loading }}
            </p>
            <p
              v-else-if="preview.result && !preview.result.valid"
              class="text-sm text-destructive"
              data-testid="publish-blocked"
              role="alert"
            >
              {{ strings.wizard.publishInvalid }}
            </p>
            <ul
              v-if="preview.result && !preview.result.valid"
              class="space-y-1 text-sm text-destructive"
            >
              <li v-for="(issue, index) in preview.result.errors" :key="`${issue.code}-${index}`">
                {{ planIssueMessage(issue.code) }}
              </li>
            </ul>

            <p v-if="tournaments.error" class="text-sm text-destructive" role="alert">
              {{ tournaments.error }}
            </p>

            <button
              id="wizard-publish-button"
              class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              type="button"
              :disabled="!canPublish"
              @click="submitPublish"
            >
              {{ tournaments.publishing ? strings.wizard.publishing : strings.wizard.publish }}
            </button>
          </div>

          <div class="flex justify-between gap-2 border-t border-border pt-3">
            <button
              class="h-11 rounded-md border border-border px-4 text-sm font-medium disabled:opacity-60"
              type="button"
              :disabled="stepIndex() === 0"
              @click="previous"
            >
              {{ strings.wizard.previous }}
            </button>
            <button
              class="h-11 rounded-md border border-border px-4 text-sm font-medium disabled:opacity-60"
              type="button"
              :disabled="stepIndex() === STEPS.length - 1"
              @click="next"
            >
              {{ strings.wizard.next }}
            </button>
          </div>
        </div>
      </template>

      <p v-else class="text-sm text-muted-foreground">{{ strings.errors.forbidden }}</p>
    </template>
  </section>
</template>
