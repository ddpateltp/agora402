import { createRouter, createWebHistory } from 'vue-router';
import LandingPage from './pages/LandingPage.vue';
import MarketplacePage from './pages/MarketplacePage.vue';
import BuyPage from './pages/BuyPage.vue';
import AuditPage from './pages/AuditPage.vue';
import TrailPage from './pages/TrailPage.vue';
import DemoPage from './pages/DemoPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: LandingPage, meta: { landing: true } },
    { path: '/market', name: 'marketplace', component: MarketplacePage, meta: { title: 'Marketplace' } },
    { path: '/buy', name: 'buy', component: BuyPage, meta: { title: 'Buy' } },
    { path: '/audit', name: 'audit', component: AuditPage, meta: { title: 'Audit' } },
    { path: '/trail', name: 'trail', component: TrailPage, meta: { title: 'Trail' } },
    { path: '/demo', name: 'demo', component: DemoPage, meta: { title: 'Demo', bare: true } },
  ],
  scrollBehavior: (to, _from, saved) => saved ?? (to.hash ? { el: to.hash, top: 72 } : { top: 0 }),
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} | Agora402` : 'Agora402';
});
