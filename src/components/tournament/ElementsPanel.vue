<script setup lang="ts">
import SectionCard from '@/components/ui/SectionCard.vue'
import { computed, ref } from 'vue'

import ElementCard from './ElementCard.vue'
import AppModal from '@/components/ui/AppModal.vue'
import { strings } from '@/lib/strings'
import { useElementsStore, type ElementInput, type ElementItem } from '@/stores/elements'

const props = defineProps<{ tournamentId: string; addLocked?: boolean }>()

const elements = useElementsStore()

const editingId = ref<string | null>(null)
const formOpen = ref(false)
const name = ref('')
const description = ref('')
const imageUrl = ref('')
const videoUrl = ref('')
const customValues = ref<Record<string, string | number>>({})
const formError = ref<string | null>(null)

const sorted = computed(() =>
  [...elements.elements].sort((a, b) => a.position - b.position),
)

const fieldLabels = computed(() =>
  Object.fromEntries(elements.sortedFields.map((field) => [field.key, field.label])),
)

function inputType(type: string): string {
  if (type === 'number' || type === 'url' || type === 'date') return type
  return 'text'
}

function resetForm(): void {
  editingId.value = null
  name.value = ''
  description.value = ''
  imageUrl.value = ''
  videoUrl.value = ''
  customValues.value = {}
  formError.value = null
}

function startCreate(): void {
  if (props.addLocked) return
  resetForm()
  formOpen.value = true
}

function cancelForm(): void {
  formOpen.value = false
  resetForm()
}

function startEdit(element: ElementItem): void {
  formOpen.value = true
  editingId.value = element.id
  name.value = element.name
  description.value = element.description
  imageUrl.value = element.imageUrl
  videoUrl.value = element.videoUrl ?? ''
  customValues.value = Object.fromEntries(
    Object.entries(element.customValues).map(([key, value]) => [key, String(value)]),
  )
  formError.value = null
}

function readCustomValues(): Record<string, string | number> | null {
  const values: Record<string, string | number> = {}
  for (const field of elements.sortedFields) {
    const stored = customValues.value[field.key]
    const raw = stored === undefined || stored === null ? '' : String(stored).trim()
    if (!raw) continue
    if (field.type === 'number') {
      const number = Number(raw)
      if (!Number.isFinite(number)) return null
      values[field.key] = number
    } else {
      values[field.key] = raw
    }
  }
  return values
}

async function submit(): Promise<void> {
  if (!editingId.value && props.addLocked) return
  formError.value = null
  const values = readCustomValues()
  if (values === null) {
    formError.value = strings.errors.invalid_values
    return
  }

  const input: ElementInput = {
    name: name.value.trim(),
    description: description.value.trim(),
    imageUrl: imageUrl.value.trim(),
    videoUrl: videoUrl.value.trim() ? videoUrl.value.trim() : null,
    customValues: values,
  }

  const ok = editingId.value
    ? await elements.updateElement(editingId.value, input)
    : await elements.createElement(props.tournamentId, input)

  if (ok) {
    resetForm()
    formOpen.value = false
  }
}
</script>

<template>
  <SectionCard class="space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-1">
        <h2 class="text-base font-semibold">{{ strings.elements.title }}</h2>
        <p class="text-sm text-muted-foreground">{{ strings.elements.subtitle }}</p>
        <p v-if="addLocked" class="text-sm text-muted-foreground" role="status">
          {{ strings.elements.addLocked }}
        </p>
      </div>
      <button
        id="open-create-element"
        class="h-10 shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
        type="button"
        :disabled="addLocked"
        @click="startCreate"
      >
        {{ strings.elements.addTitle }}
      </button>
    </div>

    <p v-if="sorted.length === 0" class="text-sm text-muted-foreground">
      {{ strings.elements.empty }}
    </p>

    <ul v-else class="grid gap-3 sm:grid-cols-2">
      <li v-for="(element, index) in sorted" :key="element.id">
        <ElementCard
          :element="element"
          :labels="fieldLabels"
          can-manage
          :is-first="index === 0"
          :is-last="index === sorted.length - 1"
          @edit="startEdit(element)"
          @delete="elements.deleteElement(element.id)"
          @move="(delta) => elements.moveElement(props.tournamentId, element.id, delta)"
        />
      </li>
    </ul>

    <AppModal
      :open="formOpen"
      :title="editingId ? strings.elements.editTitle : strings.elements.addTitle"
      @close="cancelForm"
    >
      <form class="space-y-3" @submit.prevent="submit">
        <h3 class="text-sm font-semibold">
          {{ editingId ? strings.elements.editTitle : strings.elements.addTitle }}
        </h3>

        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="element-name">{{ strings.elements.name }}</label>
          <input
            id="element-name"
            v-model="name"
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            type="text"
            maxlength="120"
            :placeholder="strings.elements.namePlaceholder"
            required
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="element-image">
            {{ strings.elements.imageUrl }}
            <span class="font-normal text-muted-foreground">({{ strings.tournaments.optional }})</span>
          </label>
          <input
            id="element-image"
            v-model="imageUrl"
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            type="url"
            inputmode="url"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="element-video">
            {{ strings.elements.videoUrl }}
            <span class="font-normal text-muted-foreground">({{ strings.tournaments.optional }})</span>
          </label>
          <input
            id="element-video"
            v-model="videoUrl"
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            type="url"
            inputmode="url"
          />
          <p class="text-xs text-muted-foreground">{{ strings.elements.videoHint }}</p>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="element-description">
            {{ strings.elements.description }}
            <span class="font-normal text-muted-foreground">({{ strings.tournaments.optional }})</span>
          </label>
          <textarea
            id="element-description"
            v-model="description"
            class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
            maxlength="2000"
          />
        </div>

        <fieldset v-if="elements.sortedFields.length > 0" class="space-y-3">
          <legend class="text-sm font-medium">{{ strings.elements.customValues }}</legend>
          <div v-for="field in elements.sortedFields" :key="field.id" class="space-y-1.5">
            <label class="text-sm" :for="`element-field-${field.key}`">{{ field.label }}</label>
            <input
              :id="`element-field-${field.key}`"
              v-model="customValues[field.key]"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              :type="inputType(field.type)"
              :step="field.type === 'number' ? 'any' : undefined"
            />
          </div>
        </fieldset>

        <p v-if="formError" class="text-sm text-destructive" role="alert">{{ formError }}</p>
        <p v-if="elements.error" class="text-sm text-destructive" role="alert">
          {{ elements.error }}
        </p>

        <div class="flex flex-wrap gap-2">
          <button
            class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            type="submit"
            :disabled="elements.saving || (addLocked && !editingId)"
          >
            {{ elements.saving ? strings.tournamentDetail.saving : editingId ? strings.elements.update : strings.elements.create }}
          </button>
          <button
            v-if="editingId"
            class="h-11 rounded-md border border-border px-4 text-sm"
            type="button"
            @click="cancelForm"
          >
            {{ strings.elements.cancel }}
          </button>
        </div>
      </form>
    </AppModal>
  </SectionCard>
</template>
