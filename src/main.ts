import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from '@/App.vue'
import { initTheme } from '@/composables/theme'
import router from '@/router'
import '@/style.css'

initTheme()

createApp(App).use(createPinia()).use(router).mount('#app')
