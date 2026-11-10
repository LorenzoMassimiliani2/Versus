<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import DuelVoteCard from '@/components/tournament/DuelVoteCard.vue'
import { strings } from '@/lib/strings'
import { useVotesStore, type DuelSide } from '@/stores/votes'

const route = useRoute()
const votes = useVotesStore()

const tournamentId = computed(() => String(route.params.id))
const phaseId = computed(() => String(route.params.phaseId))
const ballot = computed(() => votes.ballot)
const phaseOpen = computed(() => ballot.value?.phase.status === 'open')

onMounted(async () => {
  await votes.load(phaseId.value)
})

async function save(matchId: string, vote: { side: DuelSide; credits: number }): Promise<void> {
  await votes.save(phaseId.value, matchId, vote)
}

async function remove(matchId: string): Promise<void> {
  await votes.remove(phaseId.value, matchId)
}
</script>

<template>
  <section class="space-y-6">
    <RouterLink
      class="inline-block text-sm font-medium underline underline-offset-4"
      :to="{ name: 'tournament', params: { id: tournamentId } }"
    >
      {{ strings.voting.back }}
    </RouterLink>

    <div v-if="votes.loading && !ballot" class="text-sm text-muted-foreground">
      {{ strings.voting.loading }}
    </div>

    <p v-if="votes.error" class="text-sm text-destructive" role="alert">{{ votes.error }}</p>

    <template v-if="ballot">
      <div class="space-y-2">
        <h1 class="text-2xl font-semibold tracking-tight">{{ strings.voting.title }}</h1>
        <p class="text-sm text-muted-foreground">{{ ballot.phase.name }}</p>
        <p v-if="!phaseOpen" class="rounded-md border border-border bg-muted/40 p-3 text-sm">
          {{ strings.voting.closed }}
        </p>
      </div>

      <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div class="rounded-md border border-border p-3">
          <dt class="text-muted-foreground">{{ strings.voting.credits }}</dt>
          <dd id="vote-balance" class="text-base font-semibold">
            {{ strings.voting.balance(ballot.balance) }}
          </dd>
        </div>
        <div class="rounded-md border border-border p-3">
          <dt class="text-muted-foreground">{{ strings.voting.maxPerMatch(ballot.maxPerMatch) }}</dt>
          <dd class="text-base font-semibold">{{ ballot.budget }}</dd>
        </div>
        <div class="rounded-md border border-border p-3">
          <dt class="text-muted-foreground">{{ strings.phases.matchesTitle }}</dt>
          <dd id="vote-completion" class="text-base font-semibold">
            {{ strings.voting.completion(ballot.completion.voted, ballot.completion.total) }}
          </dd>
        </div>
      </dl>

      <p v-if="votes.saved" class="text-sm text-muted-foreground" role="status">
        {{ strings.voting.saved }}
      </p>

      <p v-if="ballot.matches.length === 0" class="text-sm text-muted-foreground">
        {{ strings.voting.empty }}
      </p>

      <div class="space-y-4">
        <DuelVoteCard
          v-for="match in ballot.matches"
          :key="match.id"
          :match="match"
          :max-credits="ballot.maxPerMatch"
          :disabled="!phaseOpen"
          :saving="votes.saving"
          @save="(vote) => save(match.id, vote)"
          @remove="remove(match.id)"
        />
      </div>
    </template>
  </section>
</template>
