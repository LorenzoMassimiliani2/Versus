<script setup lang="ts">
import { onMounted } from 'vue'

import { auditActionLabel, auditTargetLabel, summariseAuditDiff } from '@/lib/audit'
import { strings } from '@/lib/strings'
import { useAuditStore } from '@/stores/audit'

const props = defineProps<{ tournamentId: string }>()

const audit = useAuditStore()

onMounted(() => {
  void audit.load(props.tournamentId)
})

function formattedDate(value: string): string {
  return new Date(value).toLocaleString('it-IT')
}

function shortId(value: string | null): string {
  return value ? value.slice(0, 8) : '—'
}
</script>

<template>
  <section id="audit-log" class="space-y-3 rounded-md border border-border p-4">
    <div class="space-y-1">
      <h2 class="text-base font-semibold">{{ strings.audit.title }}</h2>
      <p class="text-sm text-muted-foreground">{{ strings.audit.subtitle }}</p>
    </div>

    <p v-if="audit.loading" class="text-sm text-muted-foreground">{{ strings.audit.loading }}</p>
    <p v-else-if="audit.error" class="text-sm text-destructive" role="alert">
      {{ audit.error }}
    </p>
    <p v-else-if="audit.entries.length === 0" class="text-sm text-muted-foreground">
      {{ strings.audit.empty }}
    </p>

    <ul v-else class="divide-y divide-border">
      <li v-for="entry in audit.entries" :key="entry.id" class="space-y-1 py-2 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{{ entry.actorUsername ?? '—' }}</span>
          <span class="rounded-full border border-border px-2 py-0.5 text-xs">
            {{ auditActionLabel(entry.action) }}
          </span>
          <span class="text-xs text-muted-foreground">
            {{ auditTargetLabel(entry.targetType) }} {{ shortId(entry.targetId) }}
          </span>
          <time class="ml-auto text-xs text-muted-foreground" :datetime="entry.createdAt">
            {{ formattedDate(entry.createdAt) }}
          </time>
        </div>
        <p class="text-xs text-muted-foreground">
          {{ summariseAuditDiff(entry.before, entry.after) }}
        </p>
      </li>
    </ul>
  </section>
</template>
