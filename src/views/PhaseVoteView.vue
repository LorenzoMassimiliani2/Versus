<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import DuelVoteCard from '@/components/tournament/DuelVoteCard.vue'
import PickBallotCard from '@/components/tournament/PickBallotCard.vue'
import RankingBallotCard from '@/components/tournament/RankingBallotCard.vue'
import { strings } from '@/lib/strings'
import { useVotesStore, type DuelSide, type RankingAssignment } from '@/stores/votes'

const route = useRoute()
const votes = useVotesStore()

const tournamentId = computed(() => String(route.params.id))
const phaseId = computed(() => String(route.params.phaseId))
const ballot = computed(() => votes.ballot)
const phaseOpen = computed(() => ballot.value?.phase.status === 'open')
const voteType = computed(() => ballot.value?.phase.voteType)
const isDuel = computed(() => voteType.value === 'duel')
const isSequential = computed(() => ballot.value?.votingMode === 'sequential')
const currentTargetName = computed(() => {
  const progress = ballot.value?.progress
  if (!progress?.currentTargetId) return null
  return progress.targets.find((target) => target.id === progress.currentTargetId)?.name ?? null
})
const missingVotes = computed(() =>
  ballot.value ? Math.max(0, ballot.value.completion.total - ballot.value.completion.voted) : 0,
)

function targetOpen(target: { status?: string }): boolean {
  return target.status === undefined || target.status === 'open'
}

const title = computed(() => {
  if (voteType.value === 'ranking') return strings.voting.titleRanking
  if (voteType.value === 'pick') return strings.voting.titlePick
  return strings.voting.title
})

const subtitle = computed(() => {
  if (voteType.value === 'ranking') return strings.voting.subtitleRanking
  if (voteType.value === 'pick') return strings.voting.subtitlePick
  return strings.voting.subtitle
})

onMounted(async () => {
  await votes.load(phaseId.value)
})

async function save(matchId: string, vote: { side: DuelSide; credits: number }): Promise<void> {
  await votes.save(phaseId.value, matchId, vote)
}

async function remove(matchId: string): Promise<void> {
  await votes.remove(phaseId.value, matchId)
}

async function saveRanking(
  targetId: string,
  assignments: RankingAssignment[],
): Promise<void> {
  await votes.saveBallot(phaseId.value, targetId, 'ranking', { assignments })
}

async function savePick(targetId: string, elementId: string): Promise<void> {
  await votes.saveBallot(phaseId.value, targetId, 'pick', { elementId })
}

async function removeTarget(targetId: string): Promise<void> {
  await votes.removeBallot(phaseId.value, targetId)
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
        <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
        <p class="text-sm text-muted-foreground">{{ ballot.phase.name }}</p>
        <p class="text-sm text-muted-foreground">{{ subtitle }}</p>
        <p v-if="!phaseOpen" class="rounded-md border border-border bg-muted/40 p-3 text-sm">
          {{ strings.voting.closed }}
        </p>
      </div>

      <dl v-if="isDuel" class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
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

      <dl v-else class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div class="rounded-md border border-border p-3">
          <dt class="text-muted-foreground">{{ strings.voting.targets }}</dt>
          <dd class="text-base font-semibold">{{ ballot.targets.length }}</dd>
        </div>
        <div class="rounded-md border border-border p-3">
          <dt class="text-muted-foreground">{{ strings.voting.completionLabel }}</dt>
          <dd id="vote-completion" class="text-base font-semibold">
            {{ strings.voting.targetCompletion(ballot.completion.voted, ballot.completion.total) }}
          </dd>
        </div>
      </dl>

      <p v-if="isSequential" id="vote-missing" class="text-sm text-muted-foreground">
        {{ strings.voting.missing(missingVotes) }}
      </p>

      <section v-if="isSequential && ballot.progress" class="space-y-2 rounded-md border border-border p-3">
        <h2 class="text-sm font-semibold">{{ strings.voting.sequentialProgress }}</h2>
        <p v-if="currentTargetName" id="vote-current-target" class="text-sm">
          {{ strings.voting.currentTarget(currentTargetName) }}
        </p>
        <p v-else class="text-sm">{{ strings.voting.allTargetsDone }}</p>
        <ol class="space-y-1 text-sm">
          <li
            v-for="target in ballot.progress.targets"
            :key="target.id"
            class="flex items-center justify-between gap-2"
          >
            <span>{{ target.position }}. {{ target.name }}</span>
            <span class="text-xs uppercase tracking-wide text-muted-foreground">
              {{ strings.voting.targetStatus[target.status] }}
            </span>
          </li>
        </ol>
      </section>

      <p v-if="votes.saved" class="text-sm text-muted-foreground" role="status">
        {{ strings.voting.saved }}
      </p>

      <template v-if="isDuel">
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

      <template v-else>
        <p v-if="ballot.targets.length === 0" class="text-sm text-muted-foreground">
          {{ strings.voting.empty }}
        </p>

        <div class="space-y-4">
          <template v-for="target in ballot.targets" :key="target.id">
            <RankingBallotCard
              v-if="voteType === 'ranking'"
              :target="target"
              :disabled="!phaseOpen || !targetOpen(target)"
              :saving="votes.saving"
              @save="(assignments) => saveRanking(target.id, assignments)"
              @remove="removeTarget(target.id)"
            />
            <PickBallotCard
              v-else-if="voteType === 'pick'"
              :target="target"
              :disabled="!phaseOpen || !targetOpen(target)"
              :saving="votes.saving"
              @save="(elementId) => savePick(target.id, elementId)"
              @remove="removeTarget(target.id)"
            />
          </template>
        </div>
      </template>
    </template>
  </section>
</template>
