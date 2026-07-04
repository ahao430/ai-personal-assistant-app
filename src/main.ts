import { createApp } from "vue";
import { createPinia } from "pinia";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import App from "./App.vue";
import { router } from "./router";
import { initDb } from "./db";
import { useSyncStore } from "./stores/sync";
import "vant/lib/index.css";
import "./styles/global.css";

const app = createApp(App);
app.component("FontAwesomeIcon", FontAwesomeIcon as any);
app.use(createPinia());
app.use(router);

async function bootstrap() {
  // 通知权限（移动端）
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    const perm = await mod.isPermissionGranted();
    if (!perm) {
      await mod.requestPermission();
    }
  } catch {
    // 浏览器环境忽略
  }
  // DB
  try {
    await initDb();
  } catch (e) {
    console.warn("[db] init failed (likely not in Tauri):", e);
  }
  // 同步：加载配置 → 启动时拉一次 → 连信令
  try {
    const sync = useSyncStore();
    await sync.load();
    await sync.ensureDeviceId();
    if (sync.webdav.baseUrl) {
      sync.triggerSync().catch(() => {});
    }
    if (sync.signaling.url) {
      sync.connectSignaling();
    }
    sync.startListening();
  } catch (e) {
    console.warn("[sync] bootstrap failed:", e);
  }
}

bootstrap().finally(() => app.mount("#app"));
