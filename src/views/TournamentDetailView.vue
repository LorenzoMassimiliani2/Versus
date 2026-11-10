<script setup lang="ts">
import { FileText, Eye, Image as ImageIcon, Rocket, Route, SlidersHorizontal, Users } from '@lucide/vue'
import { computed, nextTick, onMounted, ref, type Component } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import BackLink from '@/components/ui/BackLink.vue'
import SectionCard from '@/components/ui/SectionCard.vue'
import AuditLogPanel from '@/components/tournament/AuditLogPanel.vue'
import CustomFieldsPanel from '@/components/tournament/CustomFieldsPanel.vue'
import ElementsPanel from '@/components/tournament/ElementsPanel.vue'
import OrganizersPanel from '@/components/tournament/OrganizersPanel.vue'
import ParticipantsPanel from '@/components/tournament/ParticipantsPanel.vue'
import PhaseFlow from '@/components/tournament/PhaseFlow.vue'
import PhaseResolutionPanel from '@/components/tournament/PhaseResolutionPanel.vue'
import PhasesPanel from '@/components/tournament/PhasesPanel.vue'
import PlanPreviewPanel from '@/components/tournament/PlanPreviewPanel.vue'
import { planIssueMessage, strings, tournamentStatusLabel } from '@/lib/strings'
import { tournamentStatusClass } from '@/lib/status'
import { useElementsStore } from '@/stores/elements'
import { useParticipantsStore } from '@/stores/participants'
import { usePhasesStore } from '@/stores/phases'
import { usePlanPreviewStore } from '@/stores/plan-preview'
import { useTournamentsStore } from '@/stores/tournaments'

const route = useRoute()
const tournaments = useTournamentsStore()
const elements = useElementsStore()
const participants = useParticipantsStore()
const phases = usePhasesStore()
const planPreview = usePlanPreviewStore()

const tournamentId = computed(() => String(route.params.id))
type DetailTab =
  | 'details'
  | 'elements'
  | 'fields'
  | 'participants'
  | 'plan'
  | 'preview'
  | 'publish'
const activeTab = ref<DetailTab>('details')
const organizerTabs: Array<{ id: DetailTab; label: string; icon: Component }> = [
  { id: 'details', label: strings.wizard.steps.details, icon: FileText },
  { id: 'fields', label: strings.wizard.steps.fields, icon: SlidersHorizontal },
  { id: 'elements', label: strings.wizard.steps.elements, icon: ImageIcon },
  { id: 'participants', label: strings.wizard.steps.participants, icon: Users },
  { id: 'plan', label: strings.wizard.steps.plan, icon: Route },
  { id: 'preview', label: strings.wizard.steps.preview, icon: Eye },
  { id: 'publish', label: strings.wizard.steps.publish, icon: Rocket },
]
const isOrganizer = computed(
  () => tournaments.current?.role === 'owner' || tournaments.current?.role === 'co_organizer',
)
const tabs = computed(() =>
  isOrganizer.value
    ? organizerTabs
    : [{ id: 'details' as const, label: strings.wizard.steps.details, icon: FileText }],
)
const isOwner = computed(() => tournaments.current?.role === 'owner')
const activePhase = computed(() =>
  phases.phases.some(
    (phase) => phase.status === 'open' || phase.status === 'awaiting_resolution',
  ),
)
const participantsEditable = computed(() => {
  const status = tournaments.current?.status
  return (
    isOrganizer.value &&
    (status === 'draft' || status === 'published' || status === 'running') &&
    !activePhase.value
  )
})
const elementsAddLocked = computed(() =>
  phases.phases.some((phase) => phase.openedAt !== null),
)
const phasesEditable = computed(() => {
  const status = tournaments.current?.status
  return isOrganizer.value && (status === 'draft' || status === 'published' || status === 'running')
})
const autoAdvanceLocked = computed(() =>
  phases.phases.some((phase) => phase.status !== 'pending'),
)
const openVotePhases = computed(() =>
  isOrganizer.value
    ? []
    : phases.phases.filter((phase) => phase.status === 'open' && phase.voteType === 'duel'),
)
const resultPhases = computed(() =>
  phases.phases.filter((phase) => phase.status === 'closed' || phase.status === 'open'),
)
const resolutionPhases = computed(() =>
  phases.phases.filter((phase) => phase.status === 'awaiting_resolution'),
)
const currentPhase = computed(
  () =>
    phases.phases.find((phase) => phase.status === 'open') ??
    phases.phases.find((phase) => phase.status === 'awaiting_resolution') ??
    null,
)
const summaryLine = computed(() => {
  const parts: string[] = []
  if (phases.phases.length > 0) parts.push(strings.tournamentDetail.summaryPhases(phases.phases.length))
  if (currentPhase.value) parts.push(strings.tournamentDetail.currentPhase(currentPhase.value.name))
  return parts.join(' · ')
})
const hasEnoughElements = computed(() => elements.elements.length >= 2)
const hasParticipants = computed(() => participants.activeCount >= 1)
const planValid = computed(() => planPreview.result?.valid === true)
const publishChecklist = computed(() => [
  { label: strings.tournamentDetail.checklist.elements, done: hasEnoughElements.value },
  { label: strings.tournamentDetail.checklist.participants, done: hasParticipants.value },
  { label: strings.tournamentDetail.checklist.plan, done: planValid.value },
])
const canPublish = computed(
  () =>
    isOrganizer.value &&
    tournaments.current?.status === 'draft' &&
    !tournaments.publishing &&
    hasEnoughElements.value &&
    hasParticipants.value &&
    planValid.value,
)

const editName = ref('')
const editDescription = ref('')
const editCoverUrl = ref('')
const editSelfVoteAllowed = ref(true)
const editAutoAdvance = ref(false)
const saved = ref(false)

onMounted(async () => {
  await tournaments.loadOne(tournamentId.value)
  syncForm()
  if (route.hash) {
    await nextTick()
    document.querySelector(route.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  if (isOrganizer.value) {
    await Promise.all([
      elements.load(tournamentId.value),
      phases.load(tournamentId.value),
      planPreview.load(tournamentId.value),
      participants.load(tournamentId.value),
    ])
  } else {
    await phases.load(tournamentId.value)
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

function resultsLinkLabel(phase: { status: string; config: { secrecy?: string } }): string {
  if (phase.status === 'open' && !isOrganizer.value && (phase.config?.secrecy ?? 'live') !== 'live') {
    return strings.results.viewOwnVote
  }
  return strings.results.view
}

async function publishTournament(): Promise<void> {
  if (!canPublish.value) return
  if (await tournaments.publish(tournamentId.value)) {
    await phases.load(tournamentId.value)
  }
}

async function submitEdit(): Promise<void> {
  saved.value = false
  const ok = await tournaments.update(tournamentId.value, {
    name: editName.value,
    description: editDescription.value,
    coverUrl: editCoverUrl.value.trim() ? editCoverUrl.value.trim() : null,
    settings: {
      selfVoteAllowed: editSelfVoteAllowed.value,
      autoAdvance: editAutoAdvance.value,
    },
  })
  if (ok) saved.value = true
}
</script>

<template>
  <section class="space-y-6">
    <p v-if="tournaments.error && !tournaments.current" class="text-sm text-destructive" role="alert">
      {{ tournaments.error }}
    </p>

    <p v-if="tournaments.loading && !tournaments.current" class="text-sm text-muted-foreground">
      {{ strings.tournaments.loading }}
    </p>

    <template v-if="tournaments.current">
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <BackLink :to="{ name: 'home' }" :label="strings.tournamentDetail.back" />
          <h1 class="min-w-0 truncate text-2xl font-semibold tracking-tight">
            {{ tournaments.current.name }}
          </h1>
          <span
            class="shrink-0 rounded-full border px-2 py-0.5 text-xs"
            :class="tournamentStatusClass(tournaments.current.status)"
          >
            {{ tournamentStatusLabel(tournaments.current.status) }}
          </span>
          <span class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {{ strings.tournaments.role[tournaments.current.role] }}
          </span>
        </div>
        <p v-if="summaryLine" class="text-sm text-muted-foreground">{{ summaryLine }}</p>
      </div>

      <nav
        v-if="isOrganizer"
        class="sticky top-0 z-30 rounded-2xl bg-background/95 p-1 shadow-sm backdrop-blur"
        aria-label="Sezioni del torneo"
      >
        <div class="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap">
          <button
            v-for="tab in tabs"
            :id="`tab-${tab.id}`"
            :key="tab.id"
            class="flex h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium transition-colors sm:h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm"
            :class="
              activeTab === tab.id
                ? 'bg-muted text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            "
            type="button"
            :aria-current="activeTab === tab.id ? 'page' : undefined"
            @click="activeTab = tab.id"
          >
            <component :is="tab.icon" class="size-4 shrink-0" aria-hidden="true" />
            <span class="max-w-full truncate">{{ tab.label }}</span>
          </button>
        </div>
      </nav>

      <div v-if="activeTab === 'details'" class="space-y-6">
        <template v-if="isOrganizer">
          <PhaseResolutionPanel
            v-for="phase in resolutionPhases"
            :key="phase.id"
            :phase-id="phase.id"
            :phase-name="phase.name"
            @resolved="phases.load(tournamentId)"
          />
        </template>

        <div v-if="resultPhases.length > 0" class="space-y-2">
          <h2 class="text-base font-semibold">{{ strings.results.title }}</h2>
          <RouterLink
            v-for="phase in resultPhases"
            :id="`results-phase-${phase.id}`"
            :key="phase.id"
            class="inline-flex h-11 items-center rounded-md border border-border px-4 text-sm font-medium"
            :to="{ name: 'phase-results', params: { id: tournamentId, phaseId: phase.id } }"
          >
            {{ resultsLinkLabel(phase) }} · {{ phase.name }}
          </RouterLink>
        </div>

        <div v-if="openVotePhases.length > 0" class="space-y-2">
          <h2 class="text-base font-semibold">{{ strings.voting.title }}</h2>
          <RouterLink
            v-for="phase in openVotePhases"
            :id="`vote-phase-${phase.id}`"
            :key="phase.id"
            class="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            :to="{ name: 'phase-vote', params: { id: tournamentId, phaseId: phase.id } }"
          >
            {{ strings.voting.open }} · {{ phase.name }}
          </RouterLink>
        </div>

        <SectionCard v-if="isOrganizer" :title="strings.tournamentDetail.editTitle">
          <form id="tournament-edit-form" class="space-y-4" @submit.prevent="submitEdit">
            <img
              v-if="editCoverUrl"
              :src="editCoverUrl"
              :alt="strings.tournamentDetail.cover"
              class="max-h-56 w-full rounded-xl object-cover"
            />

            <div class="space-y-1.5">
              <label class="text-sm font-medium" for="edit-name">
                {{ strings.tournamentDetail.name }}
              </label>
              <input
                id="edit-name"
                v-model="editName"
                class="h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="text"
                maxlength="120"
                required
                @input="saved = false"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium" for="edit-description">
                {{ strings.tournamentDetail.description }}
              </label>
              <textarea
                id="edit-description"
                v-model="editDescription"
                class="min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxlength="2000"
                @input="saved = false"
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-sm font-medium" for="edit-cover">
                {{ strings.tournamentDetail.coverUrl }}
                <span class="font-normal text-muted-foreground">({{ strings.tournaments.optional }})</span>
              </label>
              <input
                id="edit-cover"
                v-model="editCoverUrl"
                class="h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="url"
                inputmode="url"
                @input="saved = false"
              />
            </div>

            <fieldset class="space-y-2 rounded-xl bg-background/60 p-4">
              <legend class="px-1 text-sm font-medium">
                {{ strings.tournamentDetail.settingsTitle }}
              </legend>
              <label class="flex items-start gap-2 text-sm">
                <input
                  id="edit-self-vote"
                  v-model="editSelfVoteAllowed"
                  class="mt-0.5 size-4"
                  type="checkbox"
                  @change="saved = false"
                />
                <span>{{ strings.tournamentDetail.selfVoteAllowed }}</span>
              </label>
              <label class="flex items-start gap-2 text-sm">
                <input
                  id="edit-auto-advance"
                  v-model="editAutoAdvance"
                  class="mt-0.5 size-4"
                  type="checkbox"
                  :disabled="autoAdvanceLocked"
                  @change="saved = false"
                />
                <span>
                  {{ strings.tournamentDetail.autoAdvance }}
                  <span v-if="autoAdvanceLocked" class="block text-xs text-muted-foreground">
                    {{ strings.tournamentDetail.autoAdvanceLocked }}
                  </span>
                </span>
              </label>
            </fieldset>

            <p v-if="tournaments.error" class="text-sm text-destructive" role="alert">
              {{ tournaments.error }}
            </p>
            <p v-if="saved" class="text-sm text-muted-foreground" role="status">
              {{ strings.tournamentDetail.saved }}
            </p>

            <button
              class="h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
              type="submit"
              :disabled="tournaments.saving"
            >
              {{ tournaments.saving ? strings.tournamentDetail.saving : strings.tournamentDetail.save }}
            </button>
          </form>
        </SectionCard>

        <SectionCard v-else :title="strings.tournamentDetail.description">
          <img
            v-if="tournaments.current.coverUrl"
            :src="tournaments.current.coverUrl"
            :alt="strings.tournamentDetail.cover"
            class="mb-4 max-h-64 w-full rounded-2xl object-cover"
          />
          <p v-if="tournaments.current.description" class="text-sm">
            {{ tournaments.current.description }}
          </p>
          <p v-else class="text-sm text-muted-foreground">
            {{ strings.tournamentDetail.noDescription }}
          </p>
        </SectionCard>

        <OrganizersPanel
          v-if="tournaments.current.organizers.length > 0"
          :tournament-id="tournamentId"
          :can-manage="isOwner"
        />

        <AuditLogPanel v-if="isOrganizer" :tournament-id="tournamentId" />

      </div>

      <div v-else-if="activeTab === 'elements'" class="space-y-4">
        <ElementsPanel :tournament-id="tournamentId" :add-locked="elementsAddLocked" />
      </div>

      <div v-else-if="activeTab === 'fields'" class="space-y-4">
        <CustomFieldsPanel :tournament-id="tournamentId" />
      </div>

      <div v-else-if="activeTab === 'participants'" class="space-y-4">
        <ParticipantsPanel :tournament-id="tournamentId" :editable="participantsEditable" />
      </div>

      <div v-else-if="activeTab === 'plan'" class="space-y-5">
        <PhaseFlow :phases="phases.phases" />
        <PhasesPanel
          :tournament-id="tournamentId"
          :editable="phasesEditable"
          :auto-advance="tournaments.current.settings.autoAdvance"
          :can-open="isOrganizer && tournaments.current.status !== 'draft'"
        />
      </div>

      <div v-else-if="activeTab === 'preview'" class="space-y-4">
        <PlanPreviewPanel :tournament-id="tournamentId" />
      </div>

      <SectionCard
        v-else-if="activeTab === 'publish'"
        :title="strings.wizard.publishTitle"
        :subtitle="strings.wizard.publishSubtitle"
      >
        <template v-if="tournaments.current.status === 'draft'">
          <div class="space-y-2">
            <div
              v-for="item in publishChecklist"
              :key="item.label"
              class="flex items-center gap-3 rounded-xl bg-background/70 px-3 py-2"
            >
              <span
                class="flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                :class="
                  item.done
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-muted text-muted-foreground'
                "
              >
                {{ item.done ? '✓' : '–' }}
              </span>
              <span class="text-sm">{{ item.label }}</span>
            </div>
          </div>

          <p class="mt-3 text-xs text-muted-foreground">
            {{
              strings.tournamentDetail.checklist.progress(
                publishChecklist.filter((item) => item.done).length,
                publishChecklist.length,
              )
            }}
          </p>

          <p v-if="planPreview.loading" class="mt-3 text-sm text-muted-foreground">
            {{ strings.planPreview.loading }}
          </p>
          <ul
            v-if="planPreview.result && !planPreview.result.valid"
            class="mt-3 space-y-1 text-sm text-destructive"
          >
            <li v-for="(issue, index) in planPreview.result.errors" :key="`${issue.code}-${index}`">
              {{ planIssueMessage(issue.code) }}
            </li>
          </ul>
          <p v-if="tournaments.error" class="mt-3 text-sm text-destructive" role="alert">
            {{ tournaments.error }}
          </p>

          <button
            id="publish-tournament"
            class="mt-4 h-11 w-full rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:w-auto"
            type="button"
            :disabled="!canPublish"
            @click="publishTournament"
          >
            {{ tournaments.publishing ? strings.wizard.publishing : strings.wizard.publish }}
          </button>
        </template>
        <p v-else class="text-sm text-muted-foreground">
          {{ strings.tournamentDetail.publishLocked }}
        </p>
      </SectionCard>



    </template>
  </section>
</template>
