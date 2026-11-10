<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import CustomFieldsPanel from '@/components/tournament/CustomFieldsPanel.vue'
import ElementsPanel from '@/components/tournament/ElementsPanel.vue'
import OrganizersPanel from '@/components/tournament/OrganizersPanel.vue'
import ParticipantsPanel from '@/components/tournament/ParticipantsPanel.vue'
import PhasesPanel from '@/components/tournament/PhasesPanel.vue'
import { strings, tournamentStatusLabel } from '@/lib/strings'
import { useElementsStore } from '@/stores/elements'
import { useTournamentsStore } from '@/stores/tournaments'

const route = useRoute()
const tournaments = useTournamentsStore()
const elements = useElementsStore()

const tournamentId = computed(() => String(route.params.id))
const isOrganizer = computed(
  () => tournaments.current?.role === 'owner' || tournaments.current?.role === 'co_organizer',
)
const isOwner = computed(() => tournaments.current?.role === 'owner')
const participantsEditable = computed(() => tournaments.current?.status === 'draft')

const editName = ref('')
const editDescription = ref('')
const editCoverUrl = ref('')
const editSelfVoteAllowed = ref(true)
const editAutoAdvance = ref(false)
const saved = ref(false)

onMounted(async () => {
  await tournaments.loadOne(tournamentId.value)
  syncForm()
  if (isOrganizer.value) await elements.load(tournamentId.value)
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
    <RouterLink
      class="inline-block text-sm font-medium underline underline-offset-4"
      :to="{ name: 'home' }"
    >
      {{ strings.tournamentDetail.back }}
    </RouterLink>

    <p v-if="tournaments.error && !tournaments.current" class="text-sm text-destructive" role="alert">
      {{ tournaments.error }}
    </p>

    <p v-if="tournaments.loading && !tournaments.current" class="text-sm text-muted-foreground">
      {{ strings.tournaments.loading }}
    </p>

    <template v-if="tournaments.current">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-semibold tracking-tight">{{ tournaments.current.name }}</h1>
          <span class="rounded-full border border-border px-2 py-0.5 text-xs">
            {{ tournamentStatusLabel(tournaments.current.status) }}
          </span>
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {{ strings.tournaments.role[tournaments.current.role] }}
          </span>
        </div>
        <p class="text-sm text-muted-foreground">
          {{ strings.tournamentDetail.slug }}: {{ tournaments.current.slug }}
        </p>
        <p
          v-if="tournaments.current.status === 'draft'"
          class="rounded-md border border-border bg-muted/40 p-3 text-sm"
        >
          {{ strings.tournamentDetail.draftNotice }}
        </p>
      </div>

      <img
        v-if="tournaments.current.coverUrl"
        :src="tournaments.current.coverUrl"
        :alt="strings.tournamentDetail.cover"
        class="max-h-64 w-full rounded-md border border-border object-cover"
      />

      <div class="space-y-2">
        <h2 class="text-base font-semibold">{{ strings.tournamentDetail.description }}</h2>
        <p v-if="tournaments.current.description" class="text-sm">
          {{ tournaments.current.description }}
        </p>
        <p v-else class="text-sm text-muted-foreground">
          {{ strings.tournamentDetail.noDescription }}
        </p>
      </div>

      <OrganizersPanel
        v-if="tournaments.current.organizers.length > 0"
        :tournament-id="tournamentId"
        :can-manage="isOwner"
      />

      <template v-if="isOrganizer">
        <ParticipantsPanel :tournament-id="tournamentId" :editable="participantsEditable" />
        <PhasesPanel :tournament-id="tournamentId" :editable="participantsEditable" />
        <CustomFieldsPanel :tournament-id="tournamentId" />
        <ElementsPanel :tournament-id="tournamentId" />
      </template>

      <form
        v-if="isOrganizer"
        id="tournament-edit-form"
        class="space-y-3 rounded-md border border-border p-4"
        @submit.prevent="submitEdit"
      >
        <h2 class="text-base font-semibold">{{ strings.tournamentDetail.editTitle }}</h2>

        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="edit-name">
            {{ strings.tournamentDetail.name }}
          </label>
          <input
            id="edit-name"
            v-model="editName"
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="text"
            maxlength="120"
            required
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="edit-description">
            {{ strings.tournamentDetail.description }}
          </label>
          <textarea
            id="edit-description"
            v-model="editDescription"
            class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxlength="2000"
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
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="url"
            inputmode="url"
          />
        </div>

        <fieldset class="space-y-2 rounded-md border border-border p-3">
          <legend class="px-1 text-sm font-medium">
            {{ strings.tournamentDetail.settingsTitle }}
          </legend>
          <label class="flex items-start gap-2 text-sm">
            <input
              id="edit-self-vote"
              v-model="editSelfVoteAllowed"
              class="mt-0.5 size-4"
              type="checkbox"
            />
            <span>{{ strings.tournamentDetail.selfVoteAllowed }}</span>
          </label>
          <label class="flex items-start gap-2 text-sm">
            <input
              id="edit-auto-advance"
              v-model="editAutoAdvance"
              class="mt-0.5 size-4"
              type="checkbox"
            />
            <span>{{ strings.tournamentDetail.autoAdvance }}</span>
          </label>
        </fieldset>

        <p v-if="tournaments.error" class="text-sm text-destructive" role="alert">
          {{ tournaments.error }}
        </p>
        <p v-if="saved" class="text-sm text-muted-foreground" role="status">
          {{ strings.tournamentDetail.saved }}
        </p>

        <button
          class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          type="submit"
          :disabled="tournaments.saving"
        >
          {{ tournaments.saving ? strings.tournamentDetail.saving : strings.tournamentDetail.save }}
        </button>
      </form>
    </template>
  </section>
</template>
