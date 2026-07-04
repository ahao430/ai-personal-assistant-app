<script setup lang="ts">
import { onMounted, onBeforeMount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import { Button, CellGroup, Field, Picker, Popup, Switch, showToast } from "vant";
import { useLlmConfigStore } from "@/stores/llm-config";
import { getLlmConfig } from "@/db/repos";
import { listModels } from "@/api/llm";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { faCaretDown } from "@fortawesome/free-solid-svg-icons";

const route = useRoute();
const router = useRouter();
const store = useLlmConfigStore();

const name = ref("");
const baseUrl = ref("https://api.openai.com/v1");
const apiKey = ref("");
const model = ref("gpt-4o-mini");
const temperature = ref(0.7);
const isDefault = ref(true);

const isDesktop = ref(false);
const fetchingModels = ref(false);
const modelList = ref<string[]>([]);
const showModelDropdown = ref(false);

onBeforeMount(() => {
  try {
    isDesktop.value =
      "__TAURI_INTERNALS__" in window &&
      !/android/i.test(navigator.userAgent);
  } catch {
    isDesktop.value = false;
  }
});

function fillFromRow(row: {
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  is_default: number;
  params: string;
}) {
  name.value = row.name;
  baseUrl.value = row.base_url;
  apiKey.value = row.api_key;
  model.value = row.model;
  isDefault.value = !!row.is_default;
  try {
    const p = JSON.parse(row.params);
    if (typeof p.temperature === "number") temperature.value = p.temperature;
  } catch { /* ignore */ }
}

async function loadEditData(editId: string) {
  const row = await getLlmConfig(editId);
  if (row) {
    fillFromRow(row);
  } else {
    showToast("未找到配置");
  }
}

function currentEditId() {
  const id = route.params.configId ?? route.params.id;
  return typeof id === "string" ? id : undefined;
}

onMounted(async () => {
  const editId = currentEditId();
  if (editId) {
    await loadEditData(editId);
  } else {
    // 新增模式
    if (!store.configs.length) {
      await store.reload();
    }
    if (!store.configs.length) {
      isDefault.value = true;
    } else if (store.defaultConfig) {
      isDefault.value = false;
    }
  }
});

// 同一组件内切换编辑目标时重新回填
watch(() => currentEditId(), (newId) => {
  if (newId) {
    loadEditData(newId);
  }
});

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
      is_default: !currentEditId() && !store.configs.length ? 1 : isDefault.value ? 1 : 0,
      params: JSON.stringify({ temperature: temperature.value }),
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
    <AppHeader title="大模型配置" show-back />
    <div class="p-3">
      <CellGroup inset>
        <Field v-model="name" label="名称" placeholder="如 OpenAI / 智谱" />
        <Field
          v-model="baseUrl"
          label="Base URL"
          placeholder="https://api.openai.com/v1"
        />
        <Field
          v-model="apiKey"
          label="API Key"
          placeholder="sk-..."
        />
        <Field v-model="model" label="模型" placeholder="gpt-4o-mini">
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
        <Field
          v-model.number="temperature"
          label="Temperature"
          type="number"
          placeholder="0.0 - 2.0"
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

      <!-- Desktop dropdown -->
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

      <!-- Mobile picker -->
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
    </div>
  </div>
</template>
