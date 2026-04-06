import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import HomeView from './views/HomeView.vue'
import AdminView from './views/AdminView.vue'
import ServerConfigView from './views/ServerConfigView.vue'
import MediaTypesView from './views/MediaTypesView.vue'
import MediaSourcesView from './views/MediaSourcesView.vue'
import IndexFolderView from './views/IndexFolderView.vue'
import MediaView from './views/MediaView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',            component: HomeView,          meta: { title: 'Library' } },
    { path: '/admin',       component: AdminView,         meta: { title: 'Administration' } },
    { path: '/serverconfig',component: ServerConfigView,  meta: { title: 'Server Config' } },
    { path: '/mediatypes',  component: MediaTypesView,    meta: { title: 'Media Types' } },
    { path: '/mediasources',component: MediaSourcesView,  meta: { title: 'Media Sources' } },
    { path: '/indexfolder', component: IndexFolderView,   meta: { title: 'Add Media' } },
    { path: '/media/:uid',  component: MediaView },
  ],
})

let _siteName = 'Coatl'
fetch('/config').then(r => r.json()).then(cfg => { _siteName = cfg.site?.title || 'Coatl' }).catch(() => {})
export function getSiteName() { return _siteName }

router.afterEach((to) => {
  const page = to.meta?.title
  document.title = page ? `${page} — ${_siteName}` : _siteName
})

createApp(App).use(router).mount('#app')
