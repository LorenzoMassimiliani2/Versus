<script setup lang="ts">
import SectionCard from '@/components/ui/SectionCard.vue'
import { computed, onMounted, ref } from 'vue'

import { strings, tournamentRoleLabel } from '@/lib/strings'
import { useParticipantsStore } from '@/stores/participants'
import { useTournamentsStore } from '@/stores/tournaments'

const props = defineProps<{ tournamentId: string; canManage: boolean }>()

const tournaments = useTournamentsStore()
const participants = useParticipantsStore()
const selectedUserId = ref('')

const organizers = computed(() => tournaments.current?.organizers ?? [])

const candidates = computed(() => {
  const taken = new Set(organizers.value.map((organizer) => organizer.userId))
  return participants.candidates.filter((candidate) => !taken.has(candidate.id))
})

onMounted(() => {
  void participants.loadCandidates(props.tournamentId)
})

async function submitNomination(): Promise<void> {
  if (!selectedUserId.value) return
  const ok = await tournaments.nominateOrganizer(props.tournamentId, selectedUserId.value)
  if (ok) selectedUserId.value = ''
}
</script>

<template>
  <SectionCard class="space-y-4">
    <div class="space-y-1">
      <h2 class="text-base font-semibold">{{ strings.organizers.title }}</h2>
      <p class="text-sm text-muted-foreground">{{ strings.organizers.subtitle }}</p>
    </div>

    <p v-if="tournaments.error" class="text-sm text-destructive" role="alert">
      {{ tournaments.error }}
    </p>

    <ul class="divide-y divide-border">
      <li
        v-for="organizer in organizers"
        :key="organizer.userId"
        class="flex flex-wrap items-center gap-2 py-2 text-sm"
      >
        <span class="font-medium">{{ organizer.username }}</span>
        <span class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {{ tournamentRoleLabel(organizer.role) }}
        </span>
        <button
          v-if="canManage && organizer.role === 'co_organizer'"
          class="ml-auto h-9 rounded-md border border-border px-3 text-sm"
          type="button"
          :disabled="tournaments.saving"
          @click="tournaments.revokeOrganizer(tournamentId, organizer.userId)"
        >
          {{ strings.organizers.revoke }}
        </button>
      </li>
    </ul>

    <form
      v-if="canManage"
      class="space-y-3 border-t border-border pt-4"
      @submit.prevent="submitNomination"
    >
      <label class="text-sm font-medium" for="organizer-select">
        {{ strings.organizers.nominateLabel }}
      </label>
      <div class="flex flex-wrap gap-2">
        <select
          id="organizer-select"
          v-model="selectedUserId"
          class="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base"
          :disabled="candidates.length === 0"
        >
          <option value="">{{ strings.organizers.select }}</option>
          <option v-for="candidate in candidates" :key="candidate.id" :value="candidate.id">
            {{ candidate.username }}
          </option>
        </select>
        <button
          class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          type="submit"
          :disabled="!selectedUserId || tournaments.saving"
        >
          {{ tournaments.saving ? strings.organizers.nominating : strings.organizers.nominate }}
        </button>
      </div>
      <p v-if="candidates.length === 0" class="text-sm text-muted-foreground">
        {{ strings.organizers.noCandidates }}
      </p>
    </form>
  </SectionCard>
</template>
