<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { strings } from '@/lib/strings'
import {
  useResultsStore,
  type OwnVote,
  type ResultsMatch,
  type ResultsMatchSide,
  type ResultsRankingRow,
} from '@/stores/results'

const route = useRoute()
const store = useResultsStore()

const tournamentId = computed(() => String(route.params.id))
const phaseId = computed(() => String(route.params.phaseId))
const results = computed(() => store.results)
const visibility = computed(() => results.value?.visibility ?? 'aggregate')
const isAggregate = computed(() => visibility.value === 'aggregate')
const ownVotes = computed(() => results.value?.ownVotes ?? [])
const hasGroups = computed(() => (results.value?.groups.length ?? 0) > 0)
const hasMatches = computed(() => (results.value?.matches.length ?? 0) > 0)
const hasRanking = computed(() => (results.value?.ranking.length ?? 0) > 0)
const hasQualified = computed(() => (results.value?.qualified.length ?? 0) > 0)
const repechageSelected = computed(() => results.value?.repechage?.selected ?? [])

const subtitle = computed(() =>
  results.value?.state === 'open' ? strings.results.subtitleOpen : strings.results.subtitle,
)

const visibilityNotice = computed((): string => {
  const value = results.value
  if (!value) return ''
  if (value.visibility === 'hidden') return strings.results.visibilityNotice.hidden
  if (value.visibility === 'own_vote') {
    return value.secrecy === 'secret'
      ? strings.results.visibilityNotice.secretOwn
      : strings.results.visibilityNotice.blind
  }
  if (value.secrecy === 'secret' && value.state === 'closed') {
    return strings.results.visibilityNotice.secretClosed
  }
  if (value.state === 'open') return strings.results.visibilityNotice.provisional
  return ''
})

onMounted(async () => {
  await store.load(phaseId.value)
})

function name(elementId: string | null): string {
  return store.elementName(elementId)
}

function closedAtLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return strings.results.closedAt(date.toLocaleString('it-IT'))
}

function resolvedByLabel(value: string | null): string {
  if (!value) return ''
  return strings.results.resolvedByLabels[value] ?? value
}

function sideLabel(side: ResultsMatchSide): string {
  if (!side.elementId) return strings.results.bye
  return name(side.elementId)
}

function isWinner(match: ResultsMatch, side: ResultsMatchSide): boolean {
  return side.elementId !== null && side.elementId === match.winnerElementId
}

function rowLabel(row: ResultsRankingRow): string {
  return name(row.elementId)
}

function ownVoteLabel(vote: OwnVote): string {
  if (vote.kind === 'duel') {
    const side = strings.results.ownVoteSide[vote.side] ?? vote.side
    return strings.results.ownVoteDuel(side, vote.credits)
  }
  if (vote.kind === 'ranking') {
    const entries = [...vote.assignments]
      .sort((left, right) => right.points - left.points)
      .map((assignment) => `${name(assignment.elementId)} ${assignment.points}`)
      .join(', ')
    return strings.results.ownVoteRanking(entries || strings.results.noOwnVotes)
  }
  return strings.results.ownVotePick(name(vote.elementId))
}
</script>

<template>
  <section class="space-y-6">
    <RouterLink
      class="inline-block text-sm font-medium underline underline-offset-4"
      :to="{ name: 'tournament', params: { id: tournamentId } }"
    >
      {{ strings.results.back }}
    </RouterLink>

    <div v-if="store.loading && !results" class="text-sm text-muted-foreground">
      {{ strings.results.loading }}
    </div>

    <p v-if="store.error" class="text-sm text-destructive" role="alert">
      {{ store.error }}
    </p>

    <template v-if="results">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">{{ strings.results.title }}</h1>
        <p class="text-base font-medium">{{ results.phase.name }}</p>
        <p class="text-sm text-muted-foreground">{{ subtitle }}</p>
        <p
          v-if="results.closedAt"
          id="results-closed-at"
          class="text-sm text-muted-foreground"
        >
          {{ closedAtLabel(results.closedAt) }}
        </p>
      </div>

      <p
        v-if="visibilityNotice"
        id="results-visibility-notice"
        class="rounded-md border border-border bg-muted/40 p-3 text-sm"
      >
        {{ visibilityNotice }}
      </p>

      <section v-if="visibility === 'own_vote'" id="results-own-votes" class="space-y-2">
        <h2 class="text-base font-semibold">{{ strings.results.ownVotesTitle }}</h2>
        <p v-if="ownVotes.length === 0" class="text-sm text-muted-foreground">
          {{ strings.results.noOwnVotes }}
        </p>
        <ul v-else class="space-y-1 text-sm">
          <li
            v-for="vote in ownVotes"
            :key="`${vote.kind}-${vote.targetId}`"
            class="rounded-md border border-border p-3"
          >
            <span class="block font-medium">{{ vote.targetName }}</span>
            <span class="block text-muted-foreground">{{ ownVoteLabel(vote) }}</span>
          </li>
        </ul>
      </section>

      <template v-if="isAggregate">
        <section
          v-if="results.winnerElementId"
          id="results-winner"
          class="space-y-1 rounded-md border border-border bg-muted/40 p-4"
        >
          <h2 class="text-base font-semibold">{{ strings.results.winnerTitle }}</h2>
          <p class="text-lg font-semibold">{{ name(results.winnerElementId) }}</p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold">{{ strings.results.qualifiedTitle }}</h2>
          <p v-if="!hasQualified" class="text-sm text-muted-foreground">
            {{ strings.results.noQualified }}
          </p>
          <ol v-else id="results-qualified" class="list-decimal space-y-1 pl-5 text-sm">
            <li v-for="elementId in results.qualified" :key="elementId">
              {{ name(elementId) }}
            </li>
          </ol>
        </section>

        <section v-if="results.repechage?.enabled" class="space-y-2">
          <h2 class="text-base font-semibold">{{ strings.results.repechageTitle }}</h2>
          <ol id="results-repechage" class="list-decimal space-y-1 pl-5 text-sm">
            <li v-for="elementId in repechageSelected" :key="elementId">
              {{ name(elementId) }}
            </li>
          </ol>
          <p class="text-xs text-muted-foreground">
            {{ strings.results.repechageCriteria(results.repechage.criteria) }}
          </p>
        </section>

        <section v-if="hasGroups" class="space-y-4">
          <h2 class="text-base font-semibold">{{ strings.results.groupsTitle }}</h2>
          <div
            v-for="(group, index) in results.groups"
            :key="group.groupId"
            class="space-y-2 rounded-md border border-border p-3"
          >
            <h3 class="text-sm font-semibold">
              {{ strings.results.groupName(index + 1, group.name) }}
            </h3>
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="text-xs uppercase tracking-wide text-muted-foreground">
                  <th class="py-1">{{ strings.results.position }}</th>
                  <th class="py-1">{{ strings.results.element }}</th>
                  <th class="py-1 text-right">{{ strings.results.score }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in group.ranking"
                  :key="row.elementId"
                  class="border-t border-border"
                >
                  <td class="py-1">{{ row.position }}</td>
                  <td class="py-1">{{ rowLabel(row) }}</td>
                  <td class="py-1 text-right">{{ row.score }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="hasRanking" class="space-y-2">
          <h2 class="text-base font-semibold">{{ strings.results.rankingTitle }}</h2>
          <table id="results-ranking" class="w-full text-left text-sm">
            <thead>
              <tr class="text-xs uppercase tracking-wide text-muted-foreground">
                <th class="py-1">{{ strings.results.position }}</th>
                <th class="py-1">{{ strings.results.element }}</th>
                <th class="py-1 text-right">{{ strings.results.score }}</th>
                <th class="py-1 text-right">{{ strings.results.firstPreferences }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in results.ranking" :key="row.elementId" class="border-t border-border">
                <td class="py-1">{{ row.position }}</td>
                <td class="py-1">{{ rowLabel(row) }}</td>
                <td class="py-1 text-right">{{ row.score }}</td>
                <td class="py-1 text-right">{{ row.firstPreferences }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section v-if="hasMatches" class="space-y-3">
          <h2 class="text-base font-semibold">{{ strings.results.matchesTitle }}</h2>
          <article
            v-for="match in results.matches"
            :key="match.matchId"
            class="space-y-2 rounded-md border border-border p-3"
          >
            <div class="flex items-center justify-between gap-2 text-sm">
              <span :class="isWinner(match, match.sideA) ? 'font-semibold' : ''">
                {{ sideLabel(match.sideA) }}
              </span>
              <span class="text-xs uppercase tracking-wide text-muted-foreground">
                {{ resolvedByLabel(match.resolvedBy) }}
              </span>
            </div>
            <dl class="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div>
                <dt>{{ strings.results.weight }}</dt>
                <dd class="text-sm text-foreground">{{ match.sideA.weight }}</dd>
              </div>
              <div>
                <dt>{{ strings.results.credits }}</dt>
                <dd class="text-sm text-foreground">{{ match.sideA.credits }}</dd>
              </div>
              <div>
                <dt>{{ strings.results.voters }}</dt>
                <dd class="text-sm text-foreground">{{ match.sideA.voters }}</dd>
              </div>
            </dl>
            <div class="flex items-center justify-between gap-2 text-sm">
              <span :class="isWinner(match, match.sideB) ? 'font-semibold' : ''">
                {{ sideLabel(match.sideB) }}
              </span>
            </div>
            <dl class="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div>
                <dt>{{ strings.results.weight }}</dt>
                <dd class="text-sm text-foreground">{{ match.sideB.weight }}</dd>
              </div>
              <div>
                <dt>{{ strings.results.credits }}</dt>
                <dd class="text-sm text-foreground">{{ match.sideB.credits }}</dd>
              </div>
              <div>
                <dt>{{ strings.results.voters }}</dt>
                <dd class="text-sm text-foreground">{{ match.sideB.voters }}</dd>
              </div>
            </dl>
            <p v-if="match.winnerElementId" class="text-xs text-muted-foreground">
              {{ strings.results.winner }}: {{ name(match.winnerElementId) }}
            </p>
          </article>
        </section>
      </template>
    </template>
  </section>
</template>
