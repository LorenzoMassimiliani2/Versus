import { createRouter, createWebHistory } from 'vue-router'

import { useSessionStore } from '@/stores/session'
import UsersView from '@/views/admin/UsersView.vue'
import LoginView from '@/views/LoginView.vue'
import PhaseResultsView from '@/views/PhaseResultsView.vue'
import PhaseVoteView from '@/views/PhaseVoteView.vue'
import TournamentDetailView from '@/views/TournamentDetailView.vue'
import TournamentWizardView from '@/views/TournamentWizardView.vue'
import TournamentsView from '@/views/TournamentsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  },
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
      path: '/tornei/:id/fase/:phaseId/voto',
      name: 'phase-vote',
      component: PhaseVoteView,
      meta: { requiresAuth: true },
    },
    {
      path: '/tornei/:id/fase/:phaseId/risultati',
      name: 'phase-results',
      component: PhaseResultsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/tornei/:id/wizard',
      name: 'tournament-wizard',
      component: TournamentWizardView,
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
