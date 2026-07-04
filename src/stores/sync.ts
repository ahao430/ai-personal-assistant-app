import { defineStore } from "pinia";
import { ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import {
  KV_KEYS,
  kvGet,
  kvGetJson,
  kvSet,
  kvSetJson,
} from "@/api/kv";
import {
  signalingStart,
  syncNow,
  type SignalingConfig,
  type SyncResult,
  type WebdavConfig,
} from "@/api/sync";

export const useSyncStore = defineStore("sync", () => {
  const webdav = ref<WebdavConfig>({ baseUrl: "", username: "", password: "" });
  const signaling = ref<SignalingConfig>({ url: "", deviceId: "" });
  const connected = ref(false);
  const syncing = ref(false);
  const lastSyncedAt = ref<number | null>(null);
  const lastError = ref<string | null>(null);
  const lastResult = ref<SyncResult | null>(null);

  async function load() {
    const wd = await kvGetJson<WebdavConfig>(KV_KEYS.webdav);
    if (wd) webdav.value = wd;
    const sg = await kvGetJson<SignalingConfig>(KV_KEYS.signaling);
    if (sg) signaling.value = sg;
    const did = await kvGet(KV_KEYS.deviceId);
    if (did && !signaling.value.deviceId) signaling.value.deviceId = did;
  }

  async function saveWebdav(cfg: WebdavConfig) {
    webdav.value = cfg;
    await kvSetJson(KV_KEYS.webdav, cfg);
  }

  async function saveSignaling(cfg: SignalingConfig) {
    signaling.value = cfg;
    await kvSetJson(KV_KEYS.signaling, cfg);
    if (cfg.deviceId) await kvSet(KV_KEYS.deviceId, cfg.deviceId);
  }

  async function ensureDeviceId() {
    if (!signaling.value.deviceId) {
      const did =
        (await kvGet(KV_KEYS.deviceId)) ||
        crypto.randomUUID();
      await kvSet(KV_KEYS.deviceId, did);
      signaling.value.deviceId = did;
    }
    return signaling.value.deviceId;
  }

  async function triggerSync(broadcast = true): Promise<SyncResult | null> {
    if (syncing.value) return null;
    if (!webdav.value.baseUrl) {
      lastError.value = "未配置 WebDAV";
      return null;
    }
    syncing.value = true;
    lastError.value = null;
    try {
      const result = await syncNow(webdav.value, broadcast);
      lastResult.value = result;
      lastSyncedAt.value = Date.now();
      return result;
    } catch (e: unknown) {
      lastError.value = String(e);
      return null;
    } finally {
      syncing.value = false;
    }
  }

  async function connectSignaling() {
    if (!signaling.value.url) return;
    try {
      await signalingStart(signaling.value);
      connected.value = true;
    } catch (e) {
      console.warn("[signaling] connect failed", e);
      connected.value = false;
    }
  }

  /** 监听 Rust 端发来的 sync-signal 事件，自动触发拉取（被动同步，不再广播） */
  async function startListening() {
    await listen<{ table: string }>("sync-signal", async () => {
      // 收到信号触发一次完整 sync，broadcast=false 避免循环
      await triggerSync(false);
    });
  }

  return {
    webdav,
    signaling,
    connected,
    syncing,
    lastSyncedAt,
    lastError,
    lastResult,
    load,
    saveWebdav,
    saveSignaling,
    ensureDeviceId,
    triggerSync,
    connectSignaling,
    startListening,
  };
});
