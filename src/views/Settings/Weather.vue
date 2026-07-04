<script setup lang="ts">
import { onMounted, ref } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import { Button, Cell, CellGroup, Field, showToast } from "vant";
import { useWeatherSettingsStore } from "@/stores/weather-settings";
import {
  detectPlatform,
  openLocationSettings,
  locationSettingsUrl,
} from "@/api/weather-location";

const store = useWeatherSettingsStore();
const manualInput = ref("");
const saving = ref(false);
const deniedPlatformSupport = ref(false);

onMounted(async () => {
  await store.load();
  manualInput.value = store.mode === "manual" ? store.city : "";
  deniedPlatformSupport.value = !!locationSettingsUrl(detectPlatform());
});

async function saveManual() {
  const v = manualInput.value.trim();
  if (!v) {
    showToast("请输入城市名");
    return;
  }
  saving.value = true;
  try {
    await store.saveManual(v);
    showToast("已保存");
  } catch (e) {
    showToast(String(e));
  } finally {
    saving.value = false;
  }
}

async function locate() {
  try {
    const r = await store.locate();
    showToast(`已定位：${r.city}`);
    manualInput.value = "";
  } catch (e) {
    const msg = String(e);
    showToast(msg);
  }
}

async function openSystemSettings() {
  const ok = await openLocationSettings();
  if (!ok) {
    showToast("当前平台不支持自动跳转，请手动到系统设置开启定位权限");
  }
}

async function clearSettings() {
  await store.clear();
  manualInput.value = "";
  showToast("已清除");
}
</script>

<template>
  <div>
    <AppHeader title="天气工具" show-back />
    <div class="p-3">
      <div class="usage-tip">
        <span class="tip-icon">💡</span>
        <span>对话中说"今天天气怎么样"会使用此处配置的默认城市；问其他城市时以你说的为准。</span>
      </div>

      <CellGroup inset title="当前位置">
        <Cell title="模式">
          <template #value>
            <span v-if="store.mode === 'gps'" class="text-brand-500">📍 定位</span>
            <span v-else class="text-stone-500">🏙 手动</span>
          </template>
        </Cell>
        <Cell title="城市" :value="store.city || '未设置'" />
        <Cell v-if="store.detail" title="详细位置" :value="store.detail" />
        <Cell
          v-if="store.updatedAt"
          title="更新时间"
          :value="new Date(store.updatedAt).toLocaleString('zh-CN')"
        />
      </CellGroup>

      <div class="mt-3 space-y-2 px-4">
        <Button
          block
          round
          type="primary"
          :loading="store.locating"
          @click="locate"
        >
          {{ store.locating ? "定位中..." : "📍 获取当前位置" }}
        </Button>
        <p class="text-center text-xs text-stone-500">
          首次使用需要在系统/浏览器中允许定位权限
        </p>
        <Button
          v-if="deniedPlatformSupport"
          block
          round
          plain
          type="default"
          @click="openSystemSettings"
        >
          打开系统定位设置
        </Button>
      </div>

      <CellGroup inset title="手动指定城市" class="mt-4">
        <Cell>
          <template #title>
            <Field
              v-model="manualInput"
              placeholder="如：北京、上海、杭州"
              clearable
              @keydown.enter.prevent="saveManual"
            />
          </template>
        </Cell>
      </CellGroup>

      <div class="mt-3 space-y-2 px-4">
        <Button
          block
          round
          :loading="saving"
          :disabled="!manualInput.trim()"
          @click="saveManual"
        >
          保存城市
        </Button>
        <Button
          v-if="store.city"
          block
          round
          plain
          type="danger"
          @click="clearSettings"
        >
          清除默认城市
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.usage-tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 4px 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.06);
  border: 1px solid rgba(59, 130, 246, 0.18);
  color: #475569;
  font-size: 12.5px;
  line-height: 1.55;
}

.tip-icon {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1.55;
}
</style>
