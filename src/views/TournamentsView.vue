<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import AppModal from '@/components/ui/AppModal.vue'
import { strings, tournamentRoleLabel, tournamentStatusLabel } from '@/lib/strings'
import { useTournamentsStore } from '@/stores/tournaments'

const tournaments = useTournamentsStore()
const router = useRouter()
const route = useRoute()

const activeTab = computed<'participating' | 'organizing'>(() =>
  route.query.tab === 'organizing' ? 'organizing' : 'participating',
)
const createOpen = ref(false)

const name = ref('')
const description = ref('')
const coverUrl = ref('')
const creating = ref(false)

const visible = computed(() =>
  activeTab.value === 'organizing' ? tournaments.organized : tournaments.participating,
)
const emptyMessage = computed(() =>
  activeTab.value === 'organizing'
    ? strings.tournaments.emptyOrganizing
    : strings.tournaments.emptyParticipating,
)

onMounted(() => {
  void tournaments.load()
})

async function submitCreate(): Promise<void> {
  if (creating.value) return
  creating.value = true
  const created = await tournaments.create({
    name: name.value,
    description: description.value,
    coverUrl: coverUrl.value.trim() ? coverUrl.value.trim() : null,
  })
  creating.value = false
  if (!created) return

  name.value = ''
  description.value = ''
  coverUrl.value = ''
  createOpen.value = false
  await router.push({ name: 'tournament', params: { id: created.id } })
}

</script>

<template>
  <section class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">{{ strings.tournaments.title }}</h1>
        <p class="text-sm text-muted-foreground">{{ strings.tournaments.subtitle }}</p>
      </div>
      <button
        id="open-create-tournament"
        class="h-10 shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        type="button"
        @click="createOpen = true"
      >
        {{ strings.tournaments.createTitle }}
      </button>
    </div>

    <p v-if="tournaments.error" class="text-sm text-destructive" role="alert">
      {{ tournaments.error }}
    </p>

    <p v-if="tournaments.loading" class="text-sm text-muted-foreground">
      {{ strings.tournaments.loading }}
    </p>
    <p v-else-if="visible.length === 0" class="text-sm text-muted-foreground">{{ emptyMessage }}</p>

    <ul v-else class="divide-y divide-border rounded-md border border-border">
      <li v-for="tournament in visible" :key="tournament.id">
        <RouterLink
          class="block space-y-2 p-3"
          :to="{ name: 'tournament', params: { id: tournament.id } }"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ tournament.name }}</span>
            <span class="rounded-full border border-border px-2 py-0.5 text-xs">
              {{ tournamentStatusLabel(tournament.status) }}
            </span>
            <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {{ tournamentRoleLabel(tournament.role) }}
            </span>
          </div>
          <p v-if="tournament.description" class="line-clamp-2 text-sm text-muted-foreground">
            {{ tournament.description }}
          </p>
        </RouterLink>
      </li>
    </ul>

    <AppModal
      :open="createOpen"
      :title="strings.tournaments.createTitle"
      @close="createOpen = false"
    >
      <form id="create-tournament-form" class="space-y-3" @submit.prevent="submitCreate">
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="tournament-name">{{ strings.tournaments.name }}</label>
          <input
            id="tournament-name"
            v-model="name"
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="text"
            :placeholder="strings.tournaments.namePlaceholder"
            maxlength="120"
            required
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="tournament-description">
            {{ strings.tournaments.description }}
          </label>
          <textarea
            id="tournament-description"
            v-model="description"
            class="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxlength="2000"
          />
        </div>

        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="tournament-cover">
            {{ strings.tournaments.coverUrl }}
            <span class="font-normal text-muted-foreground">({{ strings.tournaments.optional }})</span>
          </label>
          <input
            id="tournament-cover"
            v-model="coverUrl"
            class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="url"
            inputmode="url"
          />
        </div>

        <button
          class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          type="submit"
          :disabled="creating"
        >
          {{ creating ? strings.tournaments.creating : strings.tournaments.create }}
        </button>
      </form>
    </AppModal>
  </section>
</template>
