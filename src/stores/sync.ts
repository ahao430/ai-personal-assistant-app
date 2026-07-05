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
import { getUserPref, setUserPref } from "@/db/repos";
import {
  signalingStart,
  syncNow,
  type SignalingConfig,
  type SyncResult,
  type WebdavConfig,
} from "@/api/sync";

const USER_PREF_KEY_SIGNALING_URL = "signaling_url";

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
    // signaling URL from user_prefs (syncable), deviceId from local_kv
    const sigUrl = await getUserPref<string>(USER_PREF_KEY_SIGNALING_URL);
    if (sigUrl) signaling.value.url = sigUrl;
    else {
      // migrate legacy signaling config from local_kv
      const sg = await kvGetJson<{ url?: string }>(KV_KEYS.signaling);
      if (sg?.url) {
        signaling.value.url = sg.url;
        await setUserPref(USER_PREF_KEY_SIGNALING_URL, sg.url).catch(() => {});
      }
    }
    const did = await kvGet(KV_KEYS.deviceId);
    if (did) signaling.value.deviceId = did;
  }

  async function saveWebdav(cfg: WebdavConfig) {
    webdav.value = cfg;
    await kvSetJson(KV_KEYS.webdav, cfg);
  }

  async function saveSignaling(cfg: SignalingConfig) {
    signaling.value = cfg;
    await setUserPref(USER_PREF_KEY_SIGNALING_URL, cfg.url);
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
    const id = signaling.value.deviceId;
    // build full connection URL with device param, but don't persist it
    let connUrl = signaling.value.url;
    if (id) {
      try {
        const u = new URL(connUrl);
        u.searchParams.set("device", id);
        connUrl = u.toString();
      } catch { /* keep original */ }
    }
    const connCfg: SignalingConfig = { url: connUrl, deviceId: id };
    try {
      await signalingStart(connCfg);
      connected.value = true;
    } catch (e) {
      console.warn("[signaling] connect failed", e);
      connected.value = false;
    }
  }

  /** 监听 Rust 端发来的 sync-signal 事件，自动触发拉取（被动同步，不再广播） */
  async function startListening() {
    await listen<{ table: string }>("sync-signal", async () => {
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
