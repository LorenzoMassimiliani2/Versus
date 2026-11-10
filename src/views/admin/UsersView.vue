<script setup lang="ts">
import { MoreVertical } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

import AppModal from '@/components/ui/AppModal.vue'
import { strings } from '@/lib/strings'
import { useSessionStore } from '@/stores/session'
import { useUsersStore, type AdminUser } from '@/stores/users'

const session = useSessionStore()
const users = useUsersStore()

const createOpen = ref(false)
const query = ref('')
const newUsername = ref('')
const newPassword = ref('')
const creating = ref(false)

const resetFor = ref<string | null>(null)
const resetPasswordValue = ref('')
const resetSaving = ref(false)
const resetDoneFor = ref<string | null>(null)
const actionMenuFor = ref<string | null>(null)

onMounted(() => {
  void users.search('')
  document.addEventListener('click', closeActionMenu)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeActionMenu)
  document.removeEventListener('keydown', onKeydown)
})

function toggleActions(user: AdminUser): void {
  actionMenuFor.value = actionMenuFor.value === user.id ? null : user.id
}

function closeActionMenu(event: MouseEvent): void {
  const target = event.target as Element | null
  if (!target?.closest('[data-user-actions]')) actionMenuFor.value = null
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') actionMenuFor.value = null
}

function chooseAction(action: () => void | Promise<void>): void {
  actionMenuFor.value = null
  void action()
}

async function submitSearch(): Promise<void> {
  await users.search(query.value)
}

async function submitCreate(): Promise<void> {
  if (creating.value) return
  creating.value = true
  const ok = await users.create(newUsername.value, newPassword.value)
  creating.value = false
  if (ok) {
    newUsername.value = ''
    newPassword.value = ''
    createOpen.value = false
  }
}

function startReset(user: AdminUser): void {
  actionMenuFor.value = null
  resetFor.value = user.id
  resetPasswordValue.value = ''
  resetDoneFor.value = null
}

function cancelReset(): void {
  resetFor.value = null
  resetPasswordValue.value = ''
}

async function submitReset(user: AdminUser): Promise<void> {
  if (resetSaving.value) return
  resetSaving.value = true
  const ok = await users.resetPassword(user.id, resetPasswordValue.value)
  resetSaving.value = false
  if (ok) {
    resetFor.value = null
    resetPasswordValue.value = ''
    resetDoneFor.value = user.id
  }
}

async function toggleActive(user: AdminUser): Promise<void> {
  await users.updateUser(user.id, { isActive: !user.isActive })
}

async function toggleAdmin(user: AdminUser): Promise<void> {
  await users.updateUser(user.id, { isAdmin: !user.isAdmin })
}

</script>

<template>
  <section class="space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">{{ strings.adminUsers.title }}</h1>
        <p class="text-sm text-muted-foreground">{{ strings.adminUsers.subtitle }}</p>
      </div>
      <button
        id="open-create-user"
        class="h-10 shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        type="button"
        @click="createOpen = true"
      >
        {{ strings.adminUsers.createTitle }}
      </button>
    </div>

    <p v-if="users.error" class="text-sm text-destructive" role="alert">{{ users.error }}</p>

    <div
      v-if="users.initialPassword"
      class="space-y-2 rounded-md border border-border bg-muted/40 p-3"
      role="status"
    >
      <p class="text-sm font-medium">
        {{ strings.adminUsers.initialPasswordTitle(users.initialPassword.username) }}
      </p>
      <p class="font-mono text-lg break-all">{{ users.initialPassword.password }}</p>
      <p class="text-xs text-muted-foreground">{{ strings.adminUsers.initialPasswordHint }}</p>
      <button
        class="h-9 rounded-md border border-border px-3 text-sm font-medium"
        type="button"
        @click="users.dismissInitialPassword()"
      >
        {{ strings.adminUsers.dismiss }}
      </button>
    </div>

    <form id="user-search-form" class="flex flex-wrap items-end gap-2" @submit.prevent="submitSearch">
      <div class="flex-1 space-y-1.5">
        <label class="text-sm font-medium" for="user-search">{{ strings.adminUsers.searchLabel }}</label>
        <input
          id="user-search"
          v-model="query"
          class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          type="search"
          :placeholder="strings.adminUsers.searchPlaceholder"
          autocomplete="off"
        />
      </div>
      <button class="h-11 rounded-md border border-border px-4 text-sm font-medium" type="submit">
        {{ strings.adminUsers.search }}
      </button>
    </form>


    <p v-if="users.loading" class="text-sm text-muted-foreground">{{ strings.adminUsers.loading }}</p>
    <p v-else-if="users.users.length === 0" class="text-sm text-muted-foreground">
      {{ strings.adminUsers.empty }}
    </p>

    <ul v-else class="divide-y divide-border/60 rounded-2xl bg-muted/20">
      <li v-for="user in users.users" :key="user.id" class="space-y-3 p-3">
        <div class="flex items-center gap-3">
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-full bg-background text-sm font-semibold uppercase text-muted-foreground"
          >
            {{ user.username.charAt(0) }}
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate font-medium">{{ user.username }}</span>
              <span
                v-if="session.user?.id === user.id"
                class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {{ strings.adminUsers.you }}
              </span>
              <span
                v-if="user.isAdmin"
                class="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"
              >
                {{ strings.adminUsers.admin }}
              </span>
              <span
                v-if="!user.isActive"
                class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                {{ strings.adminUsers.inactive }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ user.isActive ? strings.adminUsers.active : strings.adminUsers.inactive }}
            </p>
          </div>

          <div class="relative shrink-0" data-user-actions>
            <button
              :id="`user-actions-${user.id}`"
              class="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              type="button"
              aria-haspopup="menu"
              :aria-expanded="actionMenuFor === user.id"
              :aria-label="strings.adminUsers.actionsFor(user.username)"
              @click="toggleActions(user)"
            >
              <MoreVertical class="size-5" aria-hidden="true" />
            </button>

            <div
              v-if="actionMenuFor === user.id"
              class="absolute right-0 top-11 z-30 w-48 rounded-xl border border-border bg-background p-1 shadow-lg"
              role="menu"
            >
              <button
                class="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                type="button"
                role="menuitem"
                @click="chooseAction(() => toggleActive(user))"
              >
                {{ user.isActive ? strings.adminUsers.deactivate : strings.adminUsers.reactivate }}
              </button>
              <button
                class="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                type="button"
                role="menuitem"
                @click="chooseAction(() => toggleAdmin(user))"
              >
                {{ user.isAdmin ? strings.adminUsers.demote : strings.adminUsers.promote }}
              </button>
              <button
                class="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                type="button"
                role="menuitem"
                @click="chooseAction(() => startReset(user))"
              >
                {{ strings.adminUsers.resetPassword }}
              </button>
            </div>
          </div>
        </div>

        <p v-if="resetDoneFor === user.id" class="text-sm text-muted-foreground" role="status">
          {{ strings.adminUsers.resetDone }}
        </p>

        <form
          v-if="resetFor === user.id"
          :id="`reset-form-${user.id}`"
          class="flex flex-wrap items-end gap-2"
          @submit.prevent="submitReset(user)"
        >
          <div class="flex-1 space-y-1.5">
            <label class="text-sm font-medium" :for="`reset-password-${user.id}`">
              {{ strings.adminUsers.newPassword }}
            </label>
            <input
              :id="`reset-password-${user.id}`"
              v-model="resetPasswordValue"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              autocomplete="new-password"
              required
            />
          </div>
          <button
            class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
            type="submit"
            :disabled="resetSaving"
          >
            {{ strings.adminUsers.savePassword }}
          </button>
          <button
            class="h-11 rounded-md border border-border px-4 text-sm font-medium"
            type="button"
            @click="cancelReset"
          >
            {{ strings.adminUsers.cancel }}
          </button>
        </form>
      </li>
    </ul>
    <AppModal
      :open="createOpen"
      :title="strings.adminUsers.createTitle"
      @close="createOpen = false"
    >
      <form id="create-user-form" class="space-y-3" @submit.prevent="submitCreate">
        <h2 class="text-base font-semibold">{{ strings.adminUsers.createTitle }}</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="text-sm font-medium" for="new-username">{{ strings.adminUsers.username }}</label>
            <input
              id="new-username"
              v-model="newUsername"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              required
            />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium" for="new-password">{{ strings.adminUsers.password }}</label>
            <input
              id="new-password"
              v-model="newPassword"
              class="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="text"
              autocomplete="new-password"
              required
            />
          </div>
        </div>
        <button
          class="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          type="submit"
          :disabled="creating"
        >
          {{ creating ? strings.adminUsers.creating : strings.adminUsers.create }}
        </button>
      </form>
    </AppModal>
  </section>
</template>
