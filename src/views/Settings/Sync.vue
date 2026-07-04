<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import {
  Button,
  Cell,
  CellGroup,
  Field,
  Tag,
  showToast,
} from "vant";
import { useSyncStore } from "@/stores/sync";

const router = useRouter();
const store = useSyncStore();

const baseUrl = ref("");
const username = ref("");
const password = ref("");
const signalingUrl = ref("");
const deviceId = ref("");

onMounted(async () => {
  await store.load();
  await store.ensureDeviceId();
  baseUrl.value = store.webdav.baseUrl;
  username.value = store.webdav.username;
  password.value = store.webdav.password;
  signalingUrl.value = store.signaling.url;
  deviceId.value = store.signaling.deviceId;
});

async function saveWebdav() {
  if (!baseUrl.value.trim()) return showToast("请输入 WebDAV URL");
  await store.saveWebdav({
    baseUrl: baseUrl.value.trim(),
    username: username.value.trim(),
    password: password.value,
  });
  showToast("WebDAV 已保存");
}

async function saveSignaling() {
  await store.saveSignaling({
    url: signalingUrl.value.trim(),
    deviceId: deviceId.value.trim(),
  });
  showToast("信令已保存");
}

function buildSignalingUrl() {
  const url = signalingUrl.value.trim();
  const id = deviceId.value.trim();
  if (!url || !id) return url;

  const u = new URL(url);
  u.searchParams.set("device", id);
  return u.toString();
}

async function syncNow() {
  if (!baseUrl.value) {
    showToast("请先配置 WebDAV");
    return;
  }
  await saveWebdav();
  const r = await store.triggerSync();
  if (r) {
    showToast(`↑${r.pushed} ↓${r.pulled} 图↑${r.imagePushed} 图↓${r.imagePulled} 跳${r.skipped}${r.errors.length ? ` 错${r.errors.length}` : ""}`);
  }
}

async function connect() {
  if (!signalingUrl.value.trim()) return showToast("请输入信令 URL");
  try {
    signalingUrl.value = buildSignalingUrl();
  } catch {
    showToast("信令 URL 格式不正确");
    return;
  }
  await saveSignaling();
  await store.connectSignaling();
  showToast(store.connected ? "已连接" : "连接失败");
}
</script>

<template>
  <div>
    <AppHeader title="同步" show-back />
    <div class="space-y-3 p-3">
      <CellGroup title="WebDAV" inset>
        <Field
          v-model="baseUrl"
          label="URL"
          placeholder="https://dav.jianguoyun.com/dav/ai-assistant/"
        />
        <Field v-model="username" label="账号" />
        <Field v-model="password" label="密码" type="password" />
      </CellGroup>
      <Cell
        title="WebDAV 配置说明"
        label="推荐坚果云 · 也支持 NAS / NextCloud"
        is-link
        @click="router.push('/settings/webdav-help')"
      />
      <Button block type="primary" plain @click="saveWebdav">保存 WebDAV</Button>

      <CellGroup title="信令服务（实时推送）" inset>
        <Field
          v-model="signalingUrl"
          label="WebSocket URL"
          placeholder="wss://xxx.workers.dev/ws"
          type="textarea"
          autosize
        />
        <Field v-model="deviceId" label="设备 ID" />
        <Cell title="状态">
          <template #value>
            <Tag :type="store.connected ? 'success' : 'default'" plain>
              {{ store.connected ? "已连接" : "未连接" }}
            </Tag>
          </template>
        </Cell>
      </CellGroup>

      <Cell
        title="信令配置说明"
        label="这是什么 · 5 步部署 · 常见问题"
        is-link
        @click="router.push('/settings/signaling-help')"
      />

      <Button block type="primary" plain @click="connect">连接信令</Button>

      <CellGroup title="手动操作" inset>
        <Cell title="立即同步" is-link @click="syncNow" />
        <Cell
          v-if="store.lastSyncedAt"
          :title="`上次同步：${new Date(store.lastSyncedAt).toLocaleString('zh-CN')}`"
        />
        <Cell
          v-if="store.lastError"
          title="最近错误"
          :label="store.lastError"
        />
        <Cell
          v-if="store.lastResult && store.lastResult.errors.length"
          title="同步错误详情"
        >
          <template #label>
            <div class="space-y-1">
              <div
                v-for="(e, i) in store.lastResult.errors"
                :key="i"
                class="text-xs text-red-600 break-all"
              >
                {{ e }}
              </div>
            </div>
          </template>
        </Cell>
      </CellGroup>

      <div class="px-4 text-xs text-gray-400">
        同步策略：聊天按日 JSON（chat/YYYY/MM/DD.json）；图片按原文件同步到 images/；其余表整表 JSON。冲突按 last-write-wins。
        Workers 挂了不影响数据，只失去实时性。
      </div>
    </div>
  </div>
</template>
