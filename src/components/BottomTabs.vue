<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { strings } from '@/lib/strings'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()

const visible = computed(() => session.isAuthenticated && route.name !== 'login')
const activeTab = computed(() => {
  if (route.name === 'admin-users') return 'users'
  if (route.name !== 'home') return null
  return route.query.tab === 'organizing' ? 'organizing' : 'participating'
})

function tabClass(active: boolean): string {
  return active ? 'text-primary' : 'text-muted-foreground'
}
</script>

<template>
  <nav
    v-if="visible"
    class="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    aria-label="Navigazione principale"
  >
    <div class="mx-auto flex w-full max-w-2xl">
      <RouterLink
        id="bottom-tab-participating"
        class="flex h-14 flex-1 flex-col items-center justify-center text-xs font-medium"
        :class="tabClass(activeTab === 'participating')"
        :to="{ name: 'home', query: { tab: 'participating' } }"
        :aria-current="activeTab === 'participating' ? 'page' : undefined"
      >
        {{ strings.tournaments.tabParticipating }}
      </RouterLink>
      <RouterLink
        id="bottom-tab-organizing"
        class="flex h-14 flex-1 flex-col items-center justify-center text-xs font-medium"
        :class="tabClass(activeTab === 'organizing')"
        :to="{ name: 'home', query: { tab: 'organizing' } }"
        :aria-current="activeTab === 'organizing' ? 'page' : undefined"
      >
        {{ strings.tournaments.tabOrganizing }}
      </RouterLink>
      <RouterLink
        v-if="session.user?.isAdmin"
        id="bottom-tab-users"
        class="flex h-14 flex-1 flex-col items-center justify-center text-xs font-medium"
        :class="tabClass(activeTab === 'users')"
        :to="{ name: 'admin-users' }"
        :aria-current="activeTab === 'users' ? 'page' : undefined"
      >
        {{ strings.tournaments.tabUsers }}
      </RouterLink>
    </div>
  </nav>
</template>
