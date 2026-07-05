<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import {
  Button,
  CellGroup,
  Field,
  Picker,
  Popup,
  Switch,
  showToast,
} from "vant";
import { useImageConfigStore } from "@/stores/image-config";
import { getImageConfig } from "@/db/repos";
import { listModels } from "@/api/llm";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { useLayoutMode } from "@/composables/useLayoutMode";

const route = useRoute();
const router = useRouter();
const store = useImageConfigStore();

const name = ref("");
const baseUrl = ref("https://api.openai.com/v1");
const apiKey = ref("");
const model = ref("gpt-image-1");
const defaultSize = ref("1024x1024");
const defaultQuality = ref("medium");
const isDefault = ref(true);

const { isDesktop } = useLayoutMode();
const fetchingModels = ref(false);
const modelList = ref<string[]>([]);
const showModelDropdown = ref(false);

const sizeOptions = [
  { text: "1024 × 1024（方形）", value: "1024x1024" },
  { text: "1536 × 1024（横）", value: "1536x1024" },
  { text: "1024 × 1536（竖）", value: "1024x1536" },
];
const qualityOptions = [
  { text: "Low（最便宜）", value: "low" },
  { text: "Medium（均衡）", value: "medium" },
  { text: "High（最精细）", value: "high" },
];

const showSizePicker = ref(false);
const showQualityPicker = ref(false);

const defaultSizeText = computed(
  () => sizeOptions.find((o) => o.value === defaultSize.value)?.text ?? defaultSize.value
);
const defaultQualityText = computed(
  () => qualityOptions.find((o) => o.value === defaultQuality.value)?.text ?? defaultQuality.value
);

function fillFromRow(row: {
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  default_size: string;
  default_quality: string;
  is_default: number;
}) {
  name.value = row.name;
  baseUrl.value = row.base_url;
  apiKey.value = row.api_key;
  model.value = row.model;
  defaultSize.value = row.default_size;
  defaultQuality.value = row.default_quality;
  isDefault.value = !!row.is_default;
}

async function loadEditData(editId: string) {
  const row = await getImageConfig(editId);
  if (row) {
    fillFromRow(row);
  } else {
    showToast("未找到配置");
  }
}

function currentEditId() {
  const raw = route.params.configId ?? route.params.id;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0];
  return undefined;
}

onMounted(async () => {
  if (!currentEditId() && !store.configs.length) {
    await store.reload();
    isDefault.value = !store.defaultConfig;
  }
});

watch(
  () => currentEditId(),
  (newId) => {
    if (newId) loadEditData(newId);
  },
  { immediate: true }
);

async function fetchModels() {
  if (!baseUrl.value.trim() || !apiKey.value.trim()) return showToast("请填写 Base URL 和 API Key");
  fetchingModels.value = true;
  try {
    const list = await listModels(baseUrl.value.trim(), apiKey.value.trim());
    if (list.length === 0) {
      showToast("未获取到模型");
    } else {
      modelList.value = list;
    }
  } catch {
    showToast("获取失败");
  } finally {
    fetchingModels.value = false;
  }
}

function selectModel(m: string) {
  model.value = m;
  showModelDropdown.value = false;
}

async function save() {
  if (!name.value.trim()) return showToast("请输入名称");
  if (!baseUrl.value.trim()) return showToast("请输入 Base URL");
  if (!model.value.trim()) return showToast("请输入模型");
  try {
    await store.save({
      id: currentEditId(),
      name: name.value.trim(),
      base_url: baseUrl.value.trim(),
      api_key: apiKey.value.trim(),
      model: model.value.trim(),
      default_size: defaultSize.value,
      default_quality: defaultQuality.value,
      is_default: !currentEditId() && !store.configs.length ? 1 : isDefault.value ? 1 : 0,
    });
    showToast("已保存");
    router.back();
  } catch (e) {
    showToast(String(e));
  }
}
</script>

<template>
  <div>
    <AppHeader title="画图模型配置" show-back />
    <div class="p-3">
      <CellGroup inset>
        <Field v-model="name" label="名称" placeholder="如 OpenAI" />
        <Field v-model="baseUrl" label="Base URL" placeholder="https://api.openai.com/v1" />
        <Field v-model="apiKey" label="API Key" placeholder="sk-..." />
        <Field v-model="model" label="模型" placeholder="gpt-image-1">
          <template #button>
            <div class="flex gap-1">
              <Button size="small" :loading="fetchingModels" @click="fetchModels">获取</Button>
              <Button
                v-if="modelList.length"
                size="small"
                plain
                @click="showModelDropdown = !showModelDropdown"
              >
                下拉
                <FontAwesomeIcon :icon="faCaretDown" class="ml-0.5 h-3 w-3" />
              </Button>
            </div>
          </template>
        </Field>
        <!-- 桌面：native select -->
        <Field v-if="isDesktop" label="默认尺寸" input-align="right">
          <template #input>
            <select
              v-model="defaultSize"
              class="w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option v-for="o in sizeOptions" :key="o.value" :value="o.value">
                {{ o.text }}
              </option>
            </select>
          </template>
        </Field>
        <!-- 移动：picker 入口 -->
        <Field
          v-else
          :model-value="defaultSizeText"
          label="默认尺寸"
          is-link
          readonly
          placeholder="选择尺寸"
          @click="showSizePicker = true"
        />

        <Field v-if="isDesktop" label="默认质量" input-align="right">
          <template #input>
            <select
              v-model="defaultQuality"
              class="w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option v-for="o in qualityOptions" :key="o.value" :value="o.value">
                {{ o.text }}
              </option>
            </select>
          </template>
        </Field>
        <Field
          v-else
          :model-value="defaultQualityText"
          label="默认质量"
          is-link
          readonly
          placeholder="选择质量"
          @click="showQualityPicker = true"
        />
        <Field label="设为默认">
          <template #input>
            <Switch v-model="isDefault" />
          </template>
        </Field>
      </CellGroup>

      <div class="mt-4">
        <Button block type="primary" @click="save">保存</Button>
      </div>
    </div>

    <!-- Desktop model dropdown -->
    <Teleport to="body">
      <div
        v-if="isDesktop && showModelDropdown"
        class="fixed inset-0 z-[9998]"
        @click="showModelDropdown = false"
      />
      <div
        v-if="isDesktop && showModelDropdown"
        class="fixed left-1/2 top-1/3 z-[9999] max-h-64 w-80 -translate-x-1/2 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-xl"
      >
        <button
          v-for="m in modelList"
          :key="m"
          class="w-full px-3 py-2 text-left text-sm transition"
          :class="m === model ? 'bg-brand-50 text-brand-700 font-medium' : 'text-stone-700 hover:bg-stone-50'"
          @click="selectModel(m)"
        >
          {{ m }}
        </button>
      </div>
    </Teleport>

    <!-- Mobile model picker -->
    <Popup v-if="!isDesktop" v-model:show="showModelDropdown" position="bottom">
      <Picker
        :columns="modelList.map((m) => ({ text: m, value: m }))"
        @confirm="
          (v) => {
            model = v.selectedValues[0];
            showModelDropdown = false;
          }
        "
        @cancel="showModelDropdown = false"
      />
    </Popup>

    <Popup v-if="!isDesktop" v-model:show="showSizePicker" position="bottom">
      <Picker
        :columns="sizeOptions.map((o) => ({ text: o.text, value: o.value }))"
        :default-index="sizeOptions.findIndex((o) => o.value === defaultSize)"
        @confirm="
          (v) => {
            defaultSize = v.selectedValues[0];
            showSizePicker = false;
          }
        "
        @cancel="showSizePicker = false"
      />
    </Popup>

    <Popup v-if="!isDesktop" v-model:show="showQualityPicker" position="bottom">
      <Picker
        :columns="qualityOptions.map((o) => ({ text: o.text, value: o.value }))"
        :default-index="qualityOptions.findIndex((o) => o.value === defaultQuality)"
        @confirm="
          (v) => {
            defaultQuality = v.selectedValues[0];
            showQualityPicker = false;
          }
        "
        @cancel="showQualityPicker = false"
      />
    </Popup>
  </div>
</template>
