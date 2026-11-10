<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { parseYouTubeVideoId, youTubeEmbedUrl } from '@/domain/youtube'
import { strings } from '@/lib/strings'
import type { BallotElement, BallotMatch, DuelSide } from '@/stores/votes'

const props = defineProps<{
  match: BallotMatch
  maxCredits: number
  disabled?: boolean
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [vote: { side: DuelSide; credits: number }]
  remove: []
}>()

const side = ref<DuelSide | null>(null)
const credits = ref(0)
const playingA = ref(false)
const playingB = ref(false)

watch(
  () => props.match.vote,
  (vote) => {
    side.value = vote?.side ?? null
    credits.value = vote?.credits ?? 0
  },
  { immediate: true },
)

const voteDisabled = computed(() => props.disabled || props.match.status !== 'open')
const creditsDisabled = computed(
  () => voteDisabled.value || side.value === null || side.value === 'abstain',
)
const canSave = computed(() => !voteDisabled.value && side.value !== null && !props.saving)

function pick(next: DuelSide): void {
  if (voteDisabled.value) return
  side.value = next
  if (next === 'abstain') credits.value = 0
}

function decrease(): void {
  credits.value = Math.max(0, credits.value - 1)
}

function increase(): void {
  credits.value = Math.min(props.maxCredits, credits.value + 1)
}

function save(): void {
  if (!canSave.value || side.value === null) return
  emit('save', { side: side.value, credits: side.value === 'abstain' ? 0 : credits.value })
}

function videoId(element: BallotElement | null): string | null {
  return element?.videoUrl ? parseYouTubeVideoId(element.videoUrl) : null
}

const embedA = computed(() => {
  const id = videoId(props.match.sideA)
  return id ? youTubeEmbedUrl(id) : null
})
const embedB = computed(() => {
  const id = videoId(props.match.sideB)
  return id ? youTubeEmbedUrl(id) : null
})
</script>

<template>
  <article class="space-y-3 rounded-md border border-border p-3">
    <header class="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span class="text-muted-foreground">
        {{ strings.phases.matchesTitle }} {{ match.round }}-{{ match.position }}
      </span>
      <span
        v-if="match.vote"
        class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
      >
        {{ strings.voting.saved }}
      </span>
    </header>

    <div class="grid gap-3 sm:grid-cols-2">
      <div
        v-for="entry in [
          { key: 'a', element: match.sideA, embed: embedA },
          { key: 'b', element: match.sideB, embed: embedB },
        ]"
        :key="entry.key"
        class="space-y-2 rounded-md border p-2"
        :class="side === entry.key ? 'border-primary' : 'border-border'"
      >
        <template v-if="entry.element">
          <img
            :src="entry.element.imageUrl"
            :alt="entry.element.name"
            class="h-32 w-full rounded-md object-cover"
            loading="lazy"
          />
          <p class="text-sm font-semibold">{{ entry.element.name }}</p>
          <iframe
            v-if="(entry.key === 'a' ? playingA : playingB) && entry.embed"
            :src="entry.embed"
            :title="strings.elements.videoTitle"
            class="aspect-video w-full rounded-md border border-border"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          />
          <button
            v-else-if="entry.embed"
            :id="`play-video-${entry.element.elementId}`"
            class="h-11 w-full rounded-md border border-border px-3 text-sm font-medium"
            type="button"
            @click="entry.key === 'a' ? (playingA = true) : (playingB = true)"
          >
            {{ strings.elements.playVideo }}
          </button>
          <button
            :id="`pick-${entry.key}-${match.id}`"
            class="h-11 w-full rounded-md border px-3 text-sm font-medium disabled:opacity-60"
            :class="side === entry.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border'"
            type="button"
            :disabled="voteDisabled"
            :aria-pressed="side === entry.key"
            @click="pick(entry.key as DuelSide)"
          >
            {{ strings.voting.selectSide(entry.element.name) }}
          </button>
        </template>
        <p v-else class="text-sm text-muted-foreground">{{ strings.phases.bye }}</p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button
        :id="`pick-abstain-${match.id}`"
        class="h-11 rounded-md border px-3 text-sm font-medium disabled:opacity-60"
        :class="side === 'abstain' ? 'border-primary bg-primary text-primary-foreground' : 'border-border'"
        type="button"
        :disabled="voteDisabled"
        :aria-pressed="side === 'abstain'"
        @click="pick('abstain')"
      >
        {{ strings.voting.abstain }}
      </button>

      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">{{ strings.voting.credits }}</span>
        <button
          :id="`credits-minus-${match.id}`"
          class="size-11 rounded-md border border-border text-lg disabled:opacity-60"
          type="button"
          :aria-label="strings.voting.decrease"
          :disabled="creditsDisabled || credits === 0"
          @click="decrease"
        >
          -
        </button>
        <output
          :id="`credits-value-${match.id}`"
          class="min-w-8 text-center text-base font-semibold"
          >{{ credits }}</output
        >
        <button
          :id="`credits-plus-${match.id}`"
          class="size-11 rounded-md border border-border text-lg disabled:opacity-60"
          type="button"
          :aria-label="strings.voting.increase"
          :disabled="creditsDisabled || credits >= maxCredits"
          @click="increase"
        >
          +
        </button>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        :id="`save-vote-${match.id}`"
        class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        type="button"
        :disabled="!canSave"
        @click="save"
      >
        {{ saving ? strings.voting.saving : strings.voting.save }}
      </button>
      <button
        v-if="match.vote"
        :id="`remove-vote-${match.id}`"
        class="h-11 rounded-md border border-destructive px-4 text-sm font-medium text-destructive disabled:opacity-60"
        type="button"
        :disabled="voteDisabled || saving"
        @click="emit('remove')"
      >
        {{ strings.voting.remove }}
      </button>
    </div>
  </article>
</template>
