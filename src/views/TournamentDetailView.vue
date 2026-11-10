<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { strings, tournamentRoleLabel, tournamentStatusLabel } from '@/lib/strings'
import { useTournamentsStore } from '@/stores/tournaments'

const route = useRoute()
const tournaments = useTournamentsStore()

const tournamentId = computed(() => String(route.params.id))
const isOrganizer = computed(
  () => tournaments.current?.role === 'owner' || tournaments.current?.role === 'co_organizer',
)

const editName = ref('')
const editDescription = ref('')
const editCoverUrl = ref('')
const saved = ref(false)

onMounted(async () => {
  await tournaments.loadOne(tournamentId.value)
  syncForm()
})

function syncForm(): void {
  const tournament = tournaments.current
  if (!tournament) return
  editName.value = tournament.name
  editDescription.value = tournament.description
  editCoverUrl.value = tournament.coverUrl ?? ''
}

async function submitEdit(): Promise<void> {
  saved.value = false
  const ok = await tournaments.update(tournamentId.value, {
    name: editName.value,
    description: editDescription.value,
    coverUrl: editCoverUrl.value.trim() ? editCoverUrl.value.trim() : null,
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
            {{ tournamentRoleLabel(tournaments.current.role) }}
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

      <div v-if="tournaments.current.organizers.length > 0" class="space-y-2">
        <h2 class="text-base font-semibold">{{ strings.tournamentDetail.organizers }}</h2>
        <ul class="space-y-1">
          <li
            v-for="organizer in tournaments.current.organizers"
            :key="organizer.userId"
            class="flex flex-wrap items-center gap-2 text-sm"
          >
            <span class="font-medium">{{ organizer.username }}</span>
            <span class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {{ tournamentRoleLabel(organizer.role) }}
            </span>
          </li>
        </ul>
      </div>

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
