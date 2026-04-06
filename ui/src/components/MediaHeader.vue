<template>
  <div class="media-header">
    <!-- Cover + meta side by side -->
    <div class="header-layout">
      <!-- Cover -->
      <div class="cover-col">
        <div class="cover-wrap">
          <img v-if="coverUrl" :src="coverUrl" :alt="media.title" class="cover-img" />
          <div v-else class="cover-placeholder"><ImageOff :size="48" style="color:#252535" /></div>
          <span class="cr-badge" :class="`cr-${media.content_rating}`">{{ media.content_rating }}</span>
        </div>
      </div>

      <!-- Text meta -->
      <div class="meta-col">
        <div class="type-badge" :style="media.mediatypeColor ? `border-color:${media.mediatypeColor};color:${media.mediatypeColor}` : ''">
          {{ media.mediatypeName }}
        </div>
        <h1 class="title">{{ media.title }}</h1>
        <p v-if="media.original_title" class="original-title">{{ media.original_title }}</p>

        <div class="meta-grid">
          <template v-if="media.artist">
            <span class="meta-key">Artist</span>
            <span class="meta-val">{{ media.artist }}</span>
          </template>
          <template v-if="media.series">
            <span class="meta-key">Series</span>
            <span class="meta-val">{{ media.series }}</span>
          </template>
          <template v-if="media.language">
            <span class="meta-key">Language</span>
            <span class="meta-val">{{ media.language }}</span>
          </template>
          <template v-if="media.page_count">
            <span class="meta-key">Pages</span>
            <span class="meta-val">{{ media.page_count }}</span>
          </template>
          <template v-if="media.source_url">
            <span class="meta-key">Source</span>
            <span class="meta-val"><a :href="media.source_url" target="_blank" rel="noopener" class="link">{{ media.source_url }}</a></span>
          </template>
          <template v-if="media.mediasourceName">
            <span class="meta-key">Library</span>
            <span class="meta-val">{{ media.mediasourceName }}</span>
          </template>
        </div>

        <!-- Stars -->
        <div v-if="media.rating" class="stars">
          <span v-for="s in 5" :key="s" :style="s <= media.rating ? 'color:#f0c040' : 'color:#2a2a3a'">★</span>
        </div>

        <!-- Summary -->
        <p v-if="media.summary" class="summary">{{ media.summary }}</p>

        <!-- Tags -->
        <div v-if="media.tags?.length" class="tags-row">
          <span
            v-for="t in media.tags" :key="t.name"
            class="tag-chip"
            @click="$emit('tag-click', t.name, $event)"
          >
            {{ t.name }}
            <em v-if="t.score" class="tag-score">{{ Math.round(t.score * 100) }}%</em>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ImageOff } from 'lucide-vue-next'

const props = defineProps({
  media: { type: Object, required: true },
})
defineEmits(['tag-click'])

const coverUrl = computed(() => {
  const m = props.media
  if (!m.cover) return null
  if (/^(https?|ftp):\/\//i.test(m.cover)) return m.cover
  if (/^([a-zA-Z]:[/\\]|[/\\])/.test(m.cover)) return `/scan/image?f=${encodeURIComponent(m.cover)}`
  return `/scan/cover/${m.uid}`
})
</script>

<style scoped>
.media-header {
  background: #13131c;
  border: 1px solid #1e1e30;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.header-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

/* Cover */
.cover-col { flex-shrink: 0; }
.cover-wrap {
  position: relative;
  width: 180px;
  aspect-ratio: 2 / 3;
  background: #0d0d14;
  border-radius: 8px;
  overflow: hidden;
}
.cover-img         { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.cr-badge {
  position: absolute; bottom: .4rem; left: .4rem;
  font-size: .6rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  padding: .15em .5em; border-radius: 4px;
}
.cr-general      { background: #1a3a1a; color: #6dcc6d; }
.cr-sensitive    { background: #3a3010; color: #f0c040; }
.cr-questionable { background: #3a1e00; color: #f08030; }
.cr-explicit     { background: #3a0a0a; color: #e05050; }

/* Meta */
.meta-col    { flex: 1; min-width: 0; }
.type-badge  {
  display: inline-block; font-size: .65rem; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; border: 1px solid #333; color: #666;
  border-radius: 4px; padding: .15em .6em; margin-bottom: .6rem;
}
.title          { font-size: 1.4rem; font-weight: 700; color: #e8e8f8; margin: 0 0 .2rem; line-height: 1.25; }
.original-title { font-size: .82rem; color: #555570; margin: 0 0 .75rem; }

.meta-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: .2rem .75rem;
  font-size: .8rem;
  margin-bottom: .75rem;
}
.meta-key { color: #484860; font-weight: 600; }
.meta-val { color: #9090b0; }
.link { color: #7c5cbf; text-decoration: none; }
.link:hover { text-decoration: underline; }

.stars       { font-size: 1.1rem; margin-bottom: .6rem; line-height: 1; }
.summary     { font-size: .82rem; color: #7070a0; line-height: 1.5; margin: 0 0 .75rem; }

.tags-row    { display: flex; flex-wrap: wrap; gap: .3rem; }
.tag-chip    {
  display: inline-flex; align-items: center; gap: .3em;
  font-size: .67rem; background: #1a1a2a; border: 1px solid #252540;
  color: #7a7a9a; border-radius: 4px; padding: .15em .5em;
  cursor: pointer; transition: background .12s, color .12s;
}
.tag-chip:hover { background: #222235; color: #a0a0c0; }
.tag-score  { font-style: normal; color: #404058; font-size: .6rem; }

@media (max-width: 600px) {
  .header-layout { flex-direction: column; }
  .cover-wrap    { width: 100%; aspect-ratio: 16 / 9; }
}
</style>
