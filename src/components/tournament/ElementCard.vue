<script setup lang="ts">
import { computed, ref } from 'vue'

import { strings } from '@/lib/strings'
import { parseYouTubeVideoId, youTubeEmbedUrl } from '@/domain/youtube'
import type { ElementItem } from '@/stores/elements'

const props = defineProps<{
  element: ElementItem
  canManage?: boolean
  isFirst?: boolean
  isLast?: boolean
  labels?: Record<string, string>
}>()

const emit = defineEmits<{
  edit: []
  delete: []
  move: [delta: -1 | 1]
}>()

const playing = ref(false)
const videoId = computed(() =>
  props.element.videoUrl ? parseYouTubeVideoId(props.element.videoUrl) : null,
)
const embedUrl = computed(() => (videoId.value ? youTubeEmbedUrl(videoId.value) : null))

function play(): void {
  playing.value = true
}
</script>

<template>
  <article class="overflow-hidden rounded-md border border-border">
    <img
      v-if="element.imageUrl"
      :src="element.imageUrl"
      :alt="element.name"
      class="h-40 w-full object-cover"
      loading="lazy"
    />

    <div class="space-y-2 p-3">
      <div class="flex items-start justify-between gap-2">
        <h3 class="text-base font-semibold">{{ element.name }}</h3>
        <span class="shrink-0 text-xs text-muted-foreground">#{{ element.position }}</span>
      </div>
      <p v-if="element.description" class="text-sm text-muted-foreground">
        {{ element.description }}
      </p>

      <dl v-if="Object.keys(element.customValues).length > 0" class="space-y-1 text-sm">
        <div
          v-for="(value, key) in element.customValues"
          :key="key"
          class="flex justify-between gap-3"
        >
          <dt class="text-muted-foreground">{{ labels?.[key] ?? key }}</dt>
          <dd class="text-right">{{ value }}</dd>
        </div>
      </dl>

      <div v-if="videoId">
        <iframe
          v-if="playing"
          :src="embedUrl ?? undefined"
          :title="strings.elements.videoTitle"
          class="aspect-video w-full rounded-md border border-border"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        />
        <button
          v-else
          class="h-11 w-full rounded-md border border-border px-3 text-sm font-medium"
          type="button"
          @click="play"
        >
          {{ strings.elements.playVideo }}
        </button>
      </div>

      <div v-if="canManage" class="flex flex-wrap gap-2">
        <button
          class="h-11 rounded-md border border-border px-3 text-sm"
          type="button"
          :aria-label="`${strings.elements.moveUp}: ${element.name}`"
          :disabled="isFirst"
          @click="emit('move', -1)"
        >
          {{ strings.elements.moveUp }}
        </button>
        <button
          class="h-11 rounded-md border border-border px-3 text-sm"
          type="button"
          :aria-label="`${strings.elements.moveDown}: ${element.name}`"
          :disabled="isLast"
          @click="emit('move', 1)"
        >
          {{ strings.elements.moveDown }}
        </button>
        <button
          class="h-11 rounded-md border border-border px-3 text-sm"
          type="button"
          @click="emit('edit')"
        >
          {{ strings.elements.edit }}
        </button>
        <button
          class="h-11 rounded-md border border-destructive px-3 text-sm text-destructive disabled:opacity-60"
          type="button"
          :disabled="element.locked"
          :title="element.locked ? strings.elements.deleteLocked : undefined"
          @click="emit('delete')"
        >
          {{ strings.elements.delete }}
        </button>
      </div>
      <p v-if="element.locked" class="text-xs text-muted-foreground">
        {{ strings.elements.deleteLocked }}
      </p>
    </div>
  </article>
</template>
