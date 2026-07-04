<script setup lang="ts">
import { onBeforeMount, onMounted, shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import { Button, Cell, CellGroup, Empty, SwipeCell, Tag, showConfirmDialog, showToast } from "vant";
import { useLlmConfigStore } from "@/stores/llm-config";

const router = useRouter();
const store = useLlmConfigStore();

const isDesktop = shallowRef(false);
const openedId = shallowRef("");

onBeforeMount(() => {
  try {
    isDesktop.value =
      "__TAURI_INTERNALS__" in window &&
      !/android/i.test(navigator.userAgent);
  } catch {
    isDesktop.value = false;
  }
});

onMounted(() => store.reload());

function add() {
  router.push({ name: "settings-llm-edit" });
}

function edit(id: string) {
  router.push({ name: "settings-llm-edit", params: { configId: id } });
}

function toggleActions(id: string) {
  openedId.value = openedId.value === id ? "" : id;
}

async function copyConfig(c: (typeof store.configs)[number]) {
  await store.save({
    name: `${c.name} 副本`,
    base_url: c.base_url,
    api_key: c.api_key,
    model: c.model,
    is_default: store.configs.length ? 0 : 1,
    params: c.params,
  });
  openedId.value = "";
  showToast("已复制");
}

async function setDefault(id: string) {
  await store.setDefault(id);
  openedId.value = "";
  showToast("已设为默认");
}

async function remove(id: string) {
  try {
    await showConfirmDialog({ title: "删除配置", message: "确认删除此模型配置？" });
    await store.remove(id);
    openedId.value = "";
    showToast("已删除");
  } catch {
    // 用户取消
  }
}
</script>

<template>
  <div>
    <AppHeader title="大模型管理" show-back />
    <div class="p-3">
      <CellGroup v-if="store.configs.length && isDesktop" inset>
        <Cell
          v-for="c in store.configs"
          :key="c.id"
          :title="c.name"
          :label="`${c.model} · ${c.base_url}`"
        >
          <template #value>
            <div class="flex items-center justify-end gap-1.5">
              <Tag v-if="c.is_default" type="primary" plain>默认</Tag>
              <Button class="model-action" size="mini" plain type="primary" @click.stop="edit(c.id)">
                编辑
              </Button>
              <Button class="model-action" size="mini" plain @click.stop="copyConfig(c)">
                复制
              </Button>
              <Button class="model-action" size="mini" plain type="danger" @click.stop="remove(c.id)">
                删除
              </Button>
              <Button
                v-if="!c.is_default"
                class="model-action set-default-action"
                size="mini"
                plain
                @click.stop="setDefault(c.id)"
              >
                设为默认
              </Button>
            </div>
          </template>
        </Cell>
      </CellGroup>

      <CellGroup v-else-if="store.configs.length" inset>
        <SwipeCell v-for="c in store.configs" :key="c.id">
          <Cell
            :title="c.name"
            :label="`${c.model} · ${c.base_url}`"
            @click="toggleActions(c.id)"
          >
            <template #value>
              <Tag v-if="c.is_default" type="primary" plain>默认</Tag>
            </template>
          </Cell>
          <div v-if="openedId === c.id" class="mobile-actions">
            <Button class="model-action" size="small" plain type="primary" @click.stop="edit(c.id)">
              编辑
            </Button>
            <Button class="model-action" size="small" plain @click.stop="copyConfig(c)">
              复制
            </Button>
            <Button class="model-action" size="small" plain type="danger" @click.stop="remove(c.id)">
              删除
            </Button>
            <Button
              v-if="!c.is_default"
              class="model-action set-default-action"
              size="small"
              plain
              @click.stop="setDefault(c.id)"
            >
              设为默认
            </Button>
          </div>
          <template #right>
            <div class="swipe-actions">
              <Button square type="primary" text="编辑" @click="edit(c.id)" />
              <Button square text="复制" @click="copyConfig(c)" />
              <Button square type="danger" text="删除" @click="remove(c.id)" />
              <Button v-if="!c.is_default" square text="设为默认" @click="setDefault(c.id)" />
            </div>
          </template>
        </SwipeCell>
      </CellGroup>

      <Empty v-else description="还没有配置" />

      <div class="mt-4 space-y-2">
        <Button block type="primary" @click="add">+ 新增配置</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-action {
  height: 24px;
  min-width: 42px;
  padding: 0 8px;
  border-radius: 999px;
}

.set-default-action {
  min-width: 64px;
}

.mobile-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 0 16px 10px;
  background: white;
}

.swipe-actions {
  display: flex;
  height: 100%;
}
</style>
