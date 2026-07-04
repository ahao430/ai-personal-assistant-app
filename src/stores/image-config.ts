import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  deleteImageConfig,
  listImageConfigs,
  upsertImageConfig,
  type ImageConfigRow,
} from "@/db/repos";
import type { ImageConfig } from "@/api/image";

export const useImageConfigStore = defineStore("imageConfig", () => {
  const configs = ref<ImageConfigRow[]>([]);
  const loading = ref(false);

  const defaultConfig = computed<ImageConfigRow | undefined>(
    () => configs.value.find((c) => c.is_default) ?? configs.value[0]
  );

  async function reload() {
    loading.value = true;
    try {
      configs.value = await listImageConfigs();
    } catch (e) {
      console.warn("[image-config] reload failed:", e);
    } finally {
      loading.value = false;
    }
  }

  async function save(
    row: Parameters<typeof upsertImageConfig>[0]
  ): Promise<string> {
    const id = await upsertImageConfig(row);
    await reload();
    return id;
  }

  async function remove(id: string) {
    await deleteImageConfig(id);
    await reload();
  }

  async function setDefault(id: string) {
    const row = configs.value.find((c) => c.id === id);
    if (!row) return;
    await upsertImageConfig({ ...row, is_default: 1 });
    await reload();
  }

  function toApi(row: ImageConfigRow): ImageConfig {
    return {
      id: row.id,
      name: row.name,
      base_url: row.base_url,
      api_key: row.api_key,
      model: row.model,
      default_size: row.default_size,
      default_quality: row.default_quality,
    };
  }

  return { configs, loading, defaultConfig, reload, save, remove, setDefault, toApi };
});
