<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  allowedAdvanceTypes,
  allowedVoteTypes,
  defaultPhaseConfig,
  type PhaseAdvance,
  type PhaseFormula,
  type PhaseVoteType,
  type RepechageRule,
} from '@/domain/phases'
import { strings } from '@/lib/strings'
import { usePhasesStore, type Phase, type PhaseInput } from '@/stores/phases'

const props = defineProps<{ tournamentId: string; editable: boolean }>()

const store = usePhasesStore()

const editingId = ref<string | null>(null)
const name = ref('')
const formula = ref<PhaseFormula>('group')
const voteType = ref<PhaseVoteType>('ranking')
const advanceType = ref<PhaseAdvance['type']>('top_per_group')
const advanceCount = ref('2')
const deadline = ref('')
const secrecy = ref<'live' | 'blind' | 'secret'>('live')
const votingMode = ref<'simultaneous' | 'sequential'>('simultaneous')
const perVoter = ref('0')
const maxPerMatch = ref('')
const configExtras = ref(defaultPhaseConfig())
const repechage = ref<RepechageRule | undefined>(undefined)

const voteTypeOptions = computed(() => allowedVoteTypes(formula.value))
const advanceOptions = computed(() => allowedAdvanceTypes(formula.value))
const canSubmit = computed(() => name.value.trim().length > 0 && !store.saving)
const canReorder = computed(
  () => props.editable && store.allPending && store.phases.length > 1,
)

onMounted(() => {
  void store.load(props.tournamentId)
})

function resetForm(): void {
  editingId.value = null
  name.value = ''
  formula.value = 'group'
  voteType.value = 'ranking'
  advanceType.value = 'top_per_group'
  advanceCount.value = '2'
  deadline.value = ''
  secrecy.value = 'live'
  votingMode.value = 'simultaneous'
  perVoter.value = '0'
  maxPerMatch.value = ''
  configExtras.value = defaultPhaseConfig()
  repechage.value = undefined
}

function startEdit(phase: Phase): void {
  editingId.value = phase.id
  name.value = phase.name
  formula.value = phase.formula
  voteType.value = phase.voteType
  advanceType.value = phase.advance.type
  advanceCount.value = 'n' in phase.advance ? String(phase.advance.n) : '2'
  repechage.value = 'repechage' in phase.advance ? phase.advance.repechage : undefined
  configExtras.value = { ...phase.config }
  deadline.value = toLocalInput(phase.config.deadline)
  secrecy.value = phase.config.secrecy
  votingMode.value = phase.config.votingMode
  perVoter.value = String(phase.config.credits.perVoter)
  maxPerMatch.value =
    phase.config.credits.maxPerMatch === null ? '' : String(phase.config.credits.maxPerMatch)
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function changeFormula(): void {
  if (!voteTypeOptions.value.includes(voteType.value)) {
    voteType.value = voteTypeOptions.value[0]!
  }
  if (!advanceOptions.value.includes(advanceType.value)) {
    advanceType.value = advanceOptions.value[0]!
  }
}

function buildAdvance(): PhaseAdvance {
  const type = advanceType.value
  if (type === 'top_global' || type === 'top_per_group') {
    const n = Math.max(1, Math.floor(Number(advanceCount.value) || 1))
    return repechage.value ? { type, n, repechage: repechage.value } : { type, n }
  }
  return { type } as PhaseAdvance
}

function buildConfig(): PhaseInput['config'] {
  const parsedMax = Number(maxPerMatch.value)
  const max =
    maxPerMatch.value.trim() === '' || Number.isNaN(parsedMax)
      ? null
      : Math.max(1, Math.floor(parsedMax))
  const triggers = configExtras.value.closeTriggers.filter((trigger) => trigger !== 'deadline')
  return {
    ...configExtras.value,
    deadline: deadline.value ? new Date(deadline.value).toISOString() : null,
    closeTriggers: deadline.value ? [...triggers, 'deadline'] : triggers,
    secrecy: secrecy.value,
    votingMode: votingMode.value,
    credits: {
      perVoter: Math.max(0, Math.floor(Number(perVoter.value) || 0)),
      maxPerMatch: max,
    },
  }
}

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  const input: PhaseInput = {
    name: name.value.trim(),
    formula: formula.value,
    voteType: voteType.value,
    config: buildConfig(),
    advance: buildAdvance(),
  }
  const ok = editingId.value
    ? await store.update(editingId.value, input)
    : await store.create(props.tournamentId, input)
  if (ok) resetForm()
}

function move(index: number, delta: number): void {
  const ids = store.phases.map((phase) => phase.id)
  const target = index + delta
  if (target < 0 || target >= ids.length) return
  ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
  void store.reorder(props.tournamentId, ids)
}

function advanceSummary(phase: Phase): string {
  const label = strings.phases.advanceLabels[phase.advance.type]
  if ('n' in phase.advance) return label.replace('N', String(phase.advance.n))
  return label
}
</script>

<template>
  <section class="space-y-4 rounded-md border border-border p-4">
    <div class="space-y-1">
      <h2 class="text-base font-semibold">{{ strings.phases.title }}</h2>
      <p class="text-sm text-muted-foreground">{{ strings.phases.subtitle }}</p>
    </div>

    <p v-if="store.error" class="text-sm text-destructive" role="alert">{{ store.error }}</p>
    <p v-if="store.loading && store.phases.length === 0" class="text-sm text-muted-foreground">
      {{ strings.tournaments.loading }}
    </p>
    <p v-else-if="store.phases.length === 0" class="text-sm text-muted-foreground">
      {{ strings.phases.empty }}
    </p>

    <ul v-else class="divide-y divide-border" data-testid="phase-list">
      <li
        v-for="(phase, index) in store.phases"
        :key="phase.id"
        class="flex flex-wrap items-start gap-2 py-3 text-sm"
        data-testid="phase-item"
      >
        <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
          {{ phase.position }}
        </span>
        <div class="min-w-0 flex-1 space-y-0.5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ phase.name }}</span>
            <span class="rounded-full border border-border px-2 py-0.5 text-xs">
              {{ strings.phases.statusLabels[phase.status] }}
            </span>
          </div>
          <p class="text-xs text-muted-foreground">
            {{ strings.phases.formulaLabels[phase.formula] }} ·
            {{ strings.phases.voteTypeLabels[phase.voteType] }} ·
            {{ advanceSummary(phase) }}
          </p>
        </div>
        <div v-if="editable" class="flex flex-wrap gap-1">
          <button
            class="h-8 rounded-md border border-border px-2 text-xs disabled:opacity-40"
            type="button"
            :disabled="!canReorder || index === 0 || store.saving"
            @click="move(index, -1)"
          >
            {{ strings.phases.moveUp }}
          </button>
          <button
            class="h-8 rounded-md border border-border px-2 text-xs disabled:opacity-40"
            type="button"
            :disabled="!canReorder || index === store.phases.length - 1 || store.saving"
            @click="move(index, 1)"
          >
            {{ strings.phases.moveDown }}
          </button>
          <button
            class="h-8 rounded-md border border-border px-2 text-xs"
            type="button"
            :disabled="store.saving"
            @click="startEdit(phase)"
          >
            {{ strings.phases.edit }}
          </button>
          <button
            class="h-8 rounded-md border border-border px-2 text-xs"
            type="button"
            :disabled="store.saving"
            @click="store.remove(tournamentId, phase.id)"
          >
            {{ strings.phases.delete }}
          </button>
        </div>
      </li>
    </ul>

    <p v-if="!editable" class="text-sm text-muted-foreground">{{ strings.phases.locked }}</p>

    <form v-else class="space-y-3 border-t border-border pt-4" @submit.prevent="submit">
      <h3 class="text-sm font-semibold">
        {{ editingId ? strings.phases.editTitle : strings.phases.addTitle }}
      </h3>

      <div class="space-y-1.5">
        <label class="text-sm font-medium" for="phase-name">{{ strings.phases.name }}</label>
        <input
          id="phase-name"
          v-model="name"
          class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="text"
          maxlength="120"
          :placeholder="strings.phases.namePlaceholder"
          required
        />
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="phase-formula">
            {{ strings.phases.formula }}
          </label>
          <select
            id="phase-formula"
            v-model="formula"
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            @change="changeFormula"
          >
            <option v-for="option in ['group', 'elimination', 'ranking'] as const" :key="option" :value="option">
              {{ strings.phases.formulaLabels[option] }}
            </option>
          </select>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="phase-vote-type">
            {{ strings.phases.voteType }}
          </label>
          <select
            id="phase-vote-type"
            v-model="voteType"
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
          >
            <option v-for="option in voteTypeOptions" :key="option" :value="option">
              {{ strings.phases.voteTypeLabels[option] }}
            </option>
          </select>
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="phase-advance">
            {{ strings.phases.advance }}
          </label>
          <select
            id="phase-advance"
            v-model="advanceType"
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
          >
            <option v-for="option in advanceOptions" :key="option" :value="option">
              {{ strings.phases.advanceLabels[option] }}
            </option>
          </select>
        </div>

        <div
          v-if="advanceType === 'top_global' || advanceType === 'top_per_group'"
          class="space-y-1.5"
        >
          <label class="text-sm font-medium" for="phase-advance-count">
            {{ strings.phases.advanceCount }}
          </label>
          <input
            id="phase-advance-count"
            v-model="advanceCount"
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            type="number"
            min="1"
          />
        </div>
      </div>

      <details class="space-y-3 rounded-md border border-border p-3">
        <summary class="cursor-pointer text-sm font-medium">
          {{ strings.phases.secrecy }}, {{ strings.phases.votingMode }} e crediti
        </summary>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="text-sm font-medium" for="phase-deadline">
              {{ strings.phases.deadline }}
              <span class="font-normal text-muted-foreground">({{ strings.phases.optional }})</span>
            </label>
            <input
              id="phase-deadline"
              v-model="deadline"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              type="datetime-local"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium" for="phase-secrecy">
              {{ strings.phases.secrecy }}
            </label>
            <select
              id="phase-secrecy"
              v-model="secrecy"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            >
              <option v-for="option in ['live', 'blind', 'secret'] as const" :key="option" :value="option">
                {{ strings.phases.secrecyLabels[option] }}
              </option>
            </select>
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium" for="phase-voting-mode">
              {{ strings.phases.votingMode }}
            </label>
            <select
              id="phase-voting-mode"
              v-model="votingMode"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
            >
              <option v-for="option in ['simultaneous', 'sequential'] as const" :key="option" :value="option">
                {{ strings.phases.votingModeLabels[option] }}
              </option>
            </select>
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium" for="phase-credits">
              {{ strings.phases.creditsPerVoter }}
            </label>
            <input
              id="phase-credits"
              v-model="perVoter"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              type="number"
              min="0"
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium" for="phase-max-credits">
              {{ strings.phases.maxPerMatch }}
            </label>
            <input
              id="phase-max-credits"
              v-model="maxPerMatch"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              type="number"
              min="1"
              :placeholder="strings.phases.optional"
            />
          </div>
        </div>
      </details>

      <div class="flex flex-wrap gap-2">
        <button
          class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          type="submit"
          :disabled="!canSubmit"
        >
          {{ editingId ? strings.phases.update : strings.phases.create }}
        </button>
        <button
          v-if="editingId"
          class="h-11 rounded-md border border-border px-4 text-sm"
          type="button"
          @click="resetForm"
        >
          {{ strings.phases.cancel }}
        </button>
      </div>
    </form>

    <div class="space-y-2 border-t border-border pt-4">
      <h3 class="text-sm font-semibold">{{ strings.phases.previewTitle }}</h3>
      <p v-if="store.phases.length === 0" class="text-sm text-muted-foreground">
        {{ strings.phases.previewEmpty }}
      </p>
      <ol v-else class="space-y-1 text-sm" data-testid="plan-preview">
        <li v-for="phase in store.phases" :key="phase.id">
          {{ phase.position }}. {{ phase.name }} →
          {{ advanceSummary(phase) }}
        </li>
      </ol>
    </div>
  </section>
</template>
