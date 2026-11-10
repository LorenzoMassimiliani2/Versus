<script setup lang="ts">
import { Moon } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { initTheme, useTheme } from '@/composables/theme'
import { strings } from '@/lib/strings'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const { theme, toggleTheme } = useTheme()
const open = ref(false)
const container = ref<HTMLElement | null>(null)

const initial = computed(() =>
  (session.user?.username.charAt(0) ?? '?').toUpperCase(),
)

function toggle(): void {
  open.value = !open.value
}

function close(event: MouseEvent): void {
  if (container.value && !container.value.contains(event.target as Node)) {
    open.value = false
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  initTheme()
  document.addEventListener('click', close)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', close)
  document.removeEventListener('keydown', onKeydown)
})

async function signOut(): Promise<void> {
  open.value = false
  await session.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div v-if="session.user" ref="container" class="relative ml-auto">
    <button
      id="user-menu-button"
      class="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
      type="button"
      :aria-label="`Account di ${session.user.username}`"
      :aria-expanded="open"
      @click="toggle"
    >
      {{ initial }}
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-11 z-50 w-48 rounded-md border border-border bg-background p-1 shadow-lg"
      role="menu"
    >
      <div class="px-3 py-2">
        <p class="text-sm font-medium">{{ session.user.username }}</p>
        <p v-if="session.user.isAdmin" class="text-xs text-muted-foreground">
          {{ strings.adminUsers.admin }}
        </p>
      </div>
      <div class="my-1 h-px bg-border" />
      <button
        id="user-menu-theme"
        class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-muted"
        type="button"
        role="menuitemcheckbox"
        :aria-checked="theme === 'dark'"
        @click="toggleTheme"
      >
        <Moon class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ strings.theme.dark }}</span>
        <span
          class="ml-auto flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors"
          :class="theme === 'dark' ? 'bg-primary' : 'bg-muted'"
          aria-hidden="true"
        >
          <span
            class="size-4 rounded-full bg-background transition-transform"
            :class="theme === 'dark' ? 'translate-x-4' : ''"
          />
        </span>
      </button>
      <button
        id="user-menu-logout"
        class="w-full rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-muted"
        type="button"
        role="menuitem"
        @click="signOut"
      >
        {{ strings.tournaments.logout }}
      </button>
    </div>
  </div>
</template>
