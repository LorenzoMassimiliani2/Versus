<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { strings } from '@/lib/strings'
import { useParticipantsStore } from '@/stores/participants'

const MAX_ACTIVE = 20

const props = defineProps<{ tournamentId: string; editable: boolean }>()

const store = useParticipantsStore()
const selectedUserId = ref('')

const activeCount = computed(() => store.activeCount)
const reachedLimit = computed(() => activeCount.value >= MAX_ACTIVE)

onMounted(() => {
  void store.load(props.tournamentId)
})

async function submitAdd(): Promise<void> {
  if (!selectedUserId.value || reachedLimit.value) return
  const ok = await store.add(props.tournamentId, selectedUserId.value)
  if (ok) selectedUserId.value = ''
}
</script>

<template>
  <section class="space-y-4 rounded-md border border-border p-4">
    <div class="space-y-1">
      <h2 class="text-base font-semibold">{{ strings.participants.title }}</h2>
      <p class="text-sm text-muted-foreground">{{ strings.participants.subtitle }}</p>
      <p class="text-sm font-medium" data-testid="participant-count">
        {{ strings.participants.count(activeCount, MAX_ACTIVE) }}
      </p>
    </div>

    <p v-if="store.error" class="text-sm text-destructive" role="alert">{{ store.error }}</p>

    <p v-if="store.participants.length === 0" class="text-sm text-muted-foreground">
      {{ strings.participants.empty }}
    </p>

    <ul v-else class="divide-y divide-border">
      <li
        v-for="participant in store.participants"
        :key="participant.userId"
        class="flex flex-wrap items-center gap-2 py-2 text-sm"
      >
        <span class="font-medium">{{ participant.username }}</span>
        <span
          class="rounded-full border border-border px-2 py-0.5 text-xs"
          :class="participant.status === 'removed' ? 'text-muted-foreground' : ''"
        >
          {{ strings.participants.status[participant.status] }}
        </span>
        <button
          v-if="editable && participant.status === 'active'"
          class="ml-auto h-9 rounded-md border border-border px-3 text-sm"
          type="button"
          :disabled="store.saving"
          @click="store.remove(tournamentId, participant.userId)"
        >
          {{ strings.participants.remove }}
        </button>
      </li>
    </ul>

    <p v-if="!editable" class="text-sm text-muted-foreground">
      {{ strings.participants.locked }}
    </p>

    <form v-else class="space-y-3 border-t border-border pt-4" @submit.prevent="submitAdd">
      <label class="text-sm font-medium" for="participant-select">
        {{ strings.participants.addLabel }}
      </label>
      <div class="flex flex-wrap gap-2">
        <select
          id="participant-select"
          v-model="selectedUserId"
          class="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base"
          :disabled="reachedLimit || store.selectableCandidates.length === 0"
        >
          <option value="">{{ strings.participants.select }}</option>
          <option
            v-for="candidate in store.selectableCandidates"
            :key="candidate.id"
            :value="candidate.id"
          >
            {{ candidate.username }}
          </option>
        </select>
        <button
          class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          type="submit"
          :disabled="!selectedUserId || reachedLimit || store.saving"
        >
          {{ store.saving ? strings.participants.adding : strings.participants.add }}
        </button>
      </div>
      <p v-if="reachedLimit" class="text-sm text-muted-foreground">
        {{ strings.participants.limit }}
      </p>
      <p
        v-else-if="store.selectableCandidates.length === 0"
        class="text-sm text-muted-foreground"
      >
        {{ strings.participants.noCandidates }}
      </p>
    </form>
  </section>
</template>
