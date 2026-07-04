<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import { Cell, CellGroup } from "vant";
import { useLlmConfigStore } from "@/stores/llm-config";
import { useImageConfigStore } from "@/stores/image-config";
import { useSyncStore } from "@/stores/sync";
import { useThemeStore } from "@/stores/theme";

const APP_VERSION = "0.0.1";

const router = useRouter();
const llm = useLlmConfigStore();
const img = useImageConfigStore();
const sync = useSyncStore();
const theme = useThemeStore();

onMounted(async () => {
  await Promise.all([llm.reload(), img.reload(), sync.load()]);
});

function go(path: string) {
  router.push(path);
}
</script>

<template>
  <div>
    <AppHeader title="我的" show-sync />
    <div class="space-y-4 p-3">
      <!-- 主题色 -->
      <section
        class="rounded-2xl bg-white p-4 shadow-card ring-1 ring-stone-100"
      >
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-stone-800">主题色</h2>
          <span class="text-xs text-stone-500">{{ theme.current.name }}</span>
        </div>
        <div class="flex items-center justify-between">
          <button
            v-for="t in theme.themes"
            :key="t.key"
            class="flex flex-1 flex-col items-center gap-1.5 py-1 transition active:scale-95"
            @click="theme.setTheme(t.key)"
          >
            <span
              class="flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-white transition"
              :class="theme.current.key === t.key ? 'ring-stone-800' : 'ring-transparent'"
              :style="{ background: t.swatch }"
            >
              <svg
                v-if="theme.current.key === t.key"
                class="h-5 w-5 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <span
              class="text-[11px]"
              :class="theme.current.key === t.key ? 'font-medium text-stone-800' : 'text-stone-500'"
            >
              {{ t.name }}
            </span>
          </button>
        </div>
      </section>

      <CellGroup title="AI" inset>
        <Cell
          title="大模型管理"
          :value="llm.defaultConfig?.name || '未配置'"
          is-link
          @click="go('/settings/llm')"
        />
        <Cell
          title="画图模型管理"
          :value="img.defaultConfig?.name || '未配置'"
          is-link
          @click="go('/settings/image')"
        />
        <Cell title="Agent 人设">
          <template #value>
            <span class="text-xs text-stone-400">敬请期待</span>
          </template>
        </Cell>
      </CellGroup>

      <CellGroup title="同步与通知" inset>
        <Cell
          title="WebDAV / 信令"
          :value="sync.webdav.baseUrl ? '已配置' : '未配置'"
          is-link
          @click="go('/settings/sync')"
        />
        <Cell title="通知">
          <template #value>
            <span class="text-xs text-stone-400">敬请期待</span>
          </template>
        </Cell>
      </CellGroup>

      <CellGroup title="数据" inset>
        <Cell title="导出 / 导入">
          <template #value>
            <span class="text-xs text-stone-400">敬请期待</span>
          </template>
        </Cell>
        <Cell title="清理">
          <template #value>
            <span class="text-xs text-stone-400">敬请期待</span>
          </template>
        </Cell>
        <Cell title="关于" :value="`v${APP_VERSION}`" is-link @click="go('/settings/about')" />
      </CellGroup>
    </div>
  </div>
</template>
