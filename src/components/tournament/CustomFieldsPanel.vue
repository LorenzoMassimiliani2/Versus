<script setup lang="ts">
import { ref } from 'vue'

import AppModal from '@/components/ui/AppModal.vue'
import { strings } from '@/lib/strings'
import { useElementsStore, type CustomFieldType } from '@/stores/elements'

const props = defineProps<{ tournamentId: string }>()

const elements = useElementsStore()
const addOpen = ref(false)
const key = ref('')
const label = ref('')
const type = ref<CustomFieldType>('text')

const types = Object.entries(strings.fields.types) as [CustomFieldType, string][]

function cancelForm(): void {
  addOpen.value = false
  key.value = ''
  label.value = ''
  type.value = 'text'
}

async function submit(): Promise<void> {
  const ok = await elements.createField(props.tournamentId, {
    key: key.value,
    label: label.value,
    type: type.value,
  })
  if (!ok) return
  cancelForm()
}
</script>

<template>
  <section class="space-y-3 rounded-md border border-border p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-1">
        <h2 class="text-base font-semibold">{{ strings.fields.title }}</h2>
        <p class="text-sm text-muted-foreground">{{ strings.fields.subtitle }}</p>
      </div>
      <button
        id="open-create-field"
        class="h-10 shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
        type="button"
        :disabled="!elements.canAddField"
        @click="addOpen = true"
      >
        {{ strings.fields.add }}
      </button>
    </div>

    <p v-if="elements.fields.length === 0" class="text-sm text-muted-foreground">
      {{ strings.fields.empty }}
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="field in elements.sortedFields"
        :key="field.id"
        class="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
      >
        <span>
          <span class="font-medium">{{ field.label }}</span>
          <span class="text-muted-foreground"> · {{ field.key }} · {{ strings.fields.types[field.type] }}</span>
        </span>
        <button
          class="h-11 shrink-0 rounded-md border border-destructive px-3 text-sm text-destructive"
          type="button"
          :aria-label="`${strings.fields.delete}: ${field.label}`"
          @click="elements.deleteField(field.id)"
        >
          {{ strings.fields.delete }}
        </button>
      </li>
    </ul>

    <p v-if="!elements.canAddField" class="text-sm text-destructive" role="status">
      {{ strings.fields.limit }}
    </p>

    <AppModal
      :open="addOpen"
      :title="strings.fields.add"
      @close="cancelForm"
    >
      <form class="space-y-3" @submit.prevent="submit">
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium" for="field-key">{{ strings.fields.key }}</label>
            <input
              id="field-key"
              v-model="key"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              type="text"
              pattern="[a-z][a-z0-9_]{0,31}"
              :placeholder="strings.fields.keyPlaceholder"
              required
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium" for="field-label">{{ strings.fields.label }}</label>
            <input
              id="field-label"
              v-model="label"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              type="text"
              maxlength="80"
              :placeholder="strings.fields.labelPlaceholder"
              required
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium" for="field-type">{{ strings.fields.type }}</label>
            <select
              id="field-type"
              v-model="type"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            >
              <option v-for="[value, text] in types" :key="value" :value="value">{{ text }}</option>
            </select>
          </div>
        </div>

        <p v-if="elements.error" class="text-sm text-destructive" role="alert">
          {{ elements.error }}
        </p>

        <button
          class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          type="submit"
          :disabled="elements.saving || !elements.canAddField"
        >
          {{ elements.saving ? strings.fields.adding : strings.fields.add }}
        </button>
      </form>
    </AppModal>
  </section>
</template>
