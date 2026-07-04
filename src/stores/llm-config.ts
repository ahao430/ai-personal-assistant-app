import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  deleteLlmConfig,
  listLlmConfigs,
  upsertLlmConfig,
  type LlmConfigRow,
} from "@/db/repos";
import type { LlmConfig } from "@/api/llm";

export const useLlmConfigStore = defineStore("llmConfig", () => {
  const configs = ref<LlmConfigRow[]>([]);
  const loading = ref(false);

  const defaultConfig = computed<LlmConfigRow | undefined>(() =>
    configs.value.find((c) => c.is_default) ?? configs.value[0]
  );

  async function reload() {
    loading.value = true;
    try {
      configs.value = await listLlmConfigs();
    } catch (e) {
      console.warn("[llm-config] reload failed:", e);
    } finally {
      loading.value = false;
    }
  }

  async function save(row: Parameters<typeof upsertLlmConfig>[0]): Promise<string> {
    const id = await upsertLlmConfig(row);
    await reload();
    return id;
  }

  async function remove(id: string) {
    await deleteLlmConfig(id);
    await reload();
  }

  async function setDefault(id: string) {
    const row = configs.value.find((c) => c.id === id);
    if (!row) return;
    await upsertLlmConfig({ ...row, is_default: 1 });
    await reload();
  }

  /** 转成 invoke 用得到的形态 */
  function toApi(row: LlmConfigRow): LlmConfig {
    return {
      id: row.id,
      name: row.name,
      base_url: row.base_url,
      api_key: row.api_key,
      model: row.model,
      params: safeParse(row.params),
    };
  }

  return { configs, loading, defaultConfig, reload, save, remove, setDefault, toApi };
});

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
