<script setup lang="ts">
import { watch } from "vue";
import { RouterView } from "vue-router";
import BottomTabBar from "@/components/BottomTabBar.vue";
import SideNav from "@/components/SideNav.vue";
import { useThemeStore } from "@/stores/theme";
import { useLayoutMode } from "@/composables/useLayoutMode";

const theme = useThemeStore();
theme.init();

const { isDesktop, toggle } = useLayoutMode();
const isDev = import.meta.env.DEV;

async function resizeDevWindow(desktop: boolean) {
  if (!isDev || !("__TAURI_INTERNALS__" in window)) return;

  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  await appWindow.setSize(
    desktop ? new LogicalSize(1100, 760) : new LogicalSize(390, 844)
  );
  await appWindow.center();
}

if (isDev) {
  watch(isDesktop, (v) => {
    resizeDevWindow(v);
  });
}
</script>

<template>
  <button
    v-if="isDev"
    class="fixed bottom-20 left-4 z-[10000] rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-stone-700 shadow-lg backdrop-blur"
    type="button"
    @click="toggle"
  >
    {{ isDesktop ? "切换移动布局" : "切换桌面布局" }}
  </button>

  <div v-if="isDesktop" class="flex h-dvh bg-stone-50 text-stone-900">
    <SideNav />
    <main class="flex-1 overflow-y-auto">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>
  </div>

  <div v-else class="flex h-dvh flex-col bg-stone-50 text-stone-900">
    <main class="flex-1 overflow-y-auto">
      <RouterView v-slot="{ Component }">
        <component :is="Component" />
      </RouterView>
    </main>
    <BottomTabBar />
  </div>
</template>
