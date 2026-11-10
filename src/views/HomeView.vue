<script setup lang="ts">
import { useRouter } from 'vue-router'

import { strings } from '@/lib/strings'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()

async function signOut(): Promise<void> {
  await session.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">{{ strings.home.title }}</h1>
        <p class="text-muted-foreground">
          {{ strings.home.signedInAs(session.user?.username ?? '') }}
        </p>
      </div>
      <button
        class="h-10 shrink-0 rounded-md border border-border px-3 text-sm font-medium"
        type="button"
        @click="signOut"
      >
        {{ strings.home.logout }}
      </button>
    </div>
    <p class="text-muted-foreground">
      Le funzionalità dei tornei arrivano con i prossimi ticket.
    </p>
  </section>
</template>
