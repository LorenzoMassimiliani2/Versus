<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { strings } from '@/lib/strings'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const submitting = ref(false)

function redirectTarget(): string {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect
  }
  return '/'
}

async function submit(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  const ok = await session.login(username.value, password.value)
  submitting.value = false
  if (ok) await router.push(redirectTarget())
}
</script>

<template>
  <section class="mx-auto w-full max-w-sm space-y-6">
    <div class="space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">{{ strings.login.title }}</h1>
      <p class="text-sm text-muted-foreground">{{ strings.login.subtitle }}</p>
    </div>

    <form class="space-y-4" novalidate @submit.prevent="submit">
      <div class="space-y-1.5">
        <label class="text-sm font-medium" for="username">{{ strings.login.username }}</label>
        <input
          id="username"
          v-model="username"
          class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="text"
          name="username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          required
        />
      </div>

      <div class="space-y-1.5">
        <label class="text-sm font-medium" for="password">{{ strings.login.password }}</label>
        <input
          id="password"
          v-model="password"
          class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="password"
          name="password"
          autocomplete="current-password"
          required
        />
      </div>

      <p v-if="session.error" class="text-sm text-destructive" role="alert">
        {{ session.error }}
      </p>

      <button
        class="h-11 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-60"
        type="submit"
        :disabled="submitting"
      >
        {{ submitting ? strings.login.submitting : strings.login.submit }}
      </button>
    </form>
  </section>
</template>
