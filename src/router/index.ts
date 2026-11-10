import { createRouter, createWebHistory } from 'vue-router'

import { useSessionStore } from '@/stores/session'
import UsersView from '@/views/admin/UsersView.vue'
import LoginView from '@/views/LoginView.vue'
import TournamentDetailView from '@/views/TournamentDetailView.vue'
import TournamentsView from '@/views/TournamentsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/',
      name: 'home',
      component: TournamentsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/tornei/:id',
      name: 'tournament',
      component: TournamentDetailView,
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/utenti',
      name: 'admin-users',
      component: UsersView,
      meta: { requiresAuth: true, requiresAdmin: true },
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.ensureLoaded()

  if (to.meta.requiresAuth && !session.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresAdmin && !session.user?.isAdmin) {
    return { name: 'home' }
  }
  if (to.name === 'login' && session.isAuthenticated) {
    return { name: 'home' }
  }
  return true
})

export default router
