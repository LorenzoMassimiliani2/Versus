import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/domain/**/*.test.ts', 'src/lib/**/*.test.ts', 'src/worker/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'views',
          environment: 'happy-dom',
          include: [
            'src/views/**/*.test.ts',
            'src/components/**/*.test.ts',
            'src/composables/**/*.test.ts',
            'src/router/**/*.test.ts',
            'src/stores/**/*.test.ts',
          ],
        },
      },
    ],
  },
})
