<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { strings } from '@/lib/strings'
import { useResolutionStore, type ResolutionTarget } from '@/stores/resolution'

const props = defineProps<{ phaseId: string; phaseName: string }>()
const emit = defineEmits<{ resolved: [] }>()

const store = useResolutionStore()
const orders = ref<Record<string, string[]>>({})
const note = ref('')
const resolved = ref(false)

const canSubmit = computed(
  () =>
    !store.saving &&
    store.targets.length > 0 &&
    note.value.trim().length > 0 &&
    store.targets.every((target) => (orders.value[target.targetId]?.length ?? 0) === target.elements.length),
)

function initialiseOrders(targets: ResolutionTarget[]): void {
  const next: Record<string, string[]> = {}
  for (const target of targets) {
    next[target.targetId] = target.elements.map((element) => element.id)
  }
  orders.value = next
}

watch(
  () => store.targets,
  (targets) => initialiseOrders(targets),
  { immediate: true },
)

onMounted(() => {
  resolved.value = false
  void store.load(props.phaseId)
})

function elementName(target: ResolutionTarget, elementId: string): string {
  return target.elements.find((element) => element.id === elementId)?.name ?? elementId
}

function ordering(target: ResolutionTarget): string[] {
  return orders.value[target.targetId] ?? target.elements.map((element) => element.id)
}

function move(target: ResolutionTarget, index: number, delta: number): void {
  const next = [...ordering(target)]
  const to = index + delta
  if (to < 0 || to >= next.length) return
  ;[next[index], next[to]] = [next[to]!, next[index]!]
  orders.value = { ...orders.value, [target.targetId]: next }
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  const ok = await store.resolve(props.phaseId, note.value, orders.value)
  if (!ok) return
  resolved.value = true
  note.value = ''
  emit('resolved')
}
</script>

<template>
  <section
    class="space-y-4 rounded-md border border-border bg-muted/30 p-4"
    data-testid="resolution-panel"
  >
    <div class="space-y-1">
      <h2 class="text-base font-semibold">{{ strings.resolution.title }} · {{ phaseName }}</h2>
      <p class="text-sm text-muted-foreground">{{ strings.resolution.subtitle }}</p>
    </div>

    <p v-if="store.error" class="text-sm text-destructive" role="alert">{{ store.error }}</p>
    <p v-if="resolved" class="text-sm text-muted-foreground" role="status">
      {{ strings.resolution.resolved }}
    </p>

    <p v-if="store.loading && store.targets.length === 0" class="text-sm text-muted-foreground">
      {{ strings.resolution.loading }}
    </p>
    <p v-else-if="store.targets.length === 0" class="text-sm text-muted-foreground">
      {{ strings.resolution.noTargets }}
    </p>

    <form v-else class="space-y-4" @submit.prevent="submit">
      <div
        v-for="target in store.targets"
        :key="target.targetId"
        class="space-y-2 rounded-md border border-border bg-background p-3"
        data-testid="resolution-target"
      >
        <h3 class="text-sm font-semibold">{{ strings.resolution.target(target.name) }}</h3>
        <p class="text-xs text-muted-foreground">{{ strings.resolution.orderHint }}</p>
        <ol class="space-y-1">
          <li
            v-for="(elementId, index) in ordering(target)"
            :key="elementId"
            class="flex items-center gap-2 text-sm"
            data-testid="resolution-element"
          >
            <span class="w-6 text-xs text-muted-foreground">{{ index + 1 }}</span>
            <span class="min-w-0 flex-1">{{ elementName(target, elementId) }}</span>
            <button
              class="h-8 rounded-md border border-border px-2 text-xs disabled:opacity-40"
              type="button"
              :disabled="index === 0 || store.saving"
              @click="move(target, index, -1)"
            >
              {{ strings.resolution.up }}
            </button>
            <button
              class="h-8 rounded-md border border-border px-2 text-xs disabled:opacity-40"
              type="button"
              :disabled="index === ordering(target).length - 1 || store.saving"
              @click="move(target, index, 1)"
            >
              {{ strings.resolution.down }}
            </button>
          </li>
        </ol>
      </div>

      <div class="space-y-1.5">
        <label class="text-sm font-medium" for="resolution-note">
          {{ strings.resolution.note }}
        </label>
        <textarea
          id="resolution-note"
          v-model="note"
          class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
          maxlength="2000"
          :placeholder="strings.resolution.notePlaceholder"
        />
        <p v-if="note.trim().length === 0" class="text-xs text-muted-foreground">
          {{ strings.resolution.noteRequired }}
        </p>
      </div>

      <button
        class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
        type="submit"
        data-testid="resolution-confirm"
        :disabled="!canSubmit"
      >
        {{ store.saving ? strings.resolution.confirming : strings.resolution.confirm }}
      </button>
    </form>
  </section>
</template>
