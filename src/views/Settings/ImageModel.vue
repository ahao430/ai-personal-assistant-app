<script setup lang="ts">
import { onMounted, shallowRef } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "@/components/AppHeader.vue";
import { Button, Cell, CellGroup, Empty, SwipeCell, Tag, showConfirmDialog, showToast } from "vant";
import { useImageConfigStore } from "@/stores/image-config";
import { useLayoutMode } from "@/composables/useLayoutMode";

const router = useRouter();
const store = useImageConfigStore();
const { isDesktop } = useLayoutMode();

const openedId = shallowRef("");

onMounted(() => store.reload());

function add() {
  router.push({ name: "settings-image-edit" });
}
function edit(id: string) {
  router.push({ name: "settings-image-edit", params: { configId: id } });
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
    default_size: c.default_size,
    default_quality: c.default_quality,
    is_default: store.configs.length ? 0 : 1,
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
    await showConfirmDialog({ title: "删除配置", message: "确认删除此画图模型配置？" });
    await store.remove(id);
    openedId.value = "";
    showToast("已删除");
  } catch {
    // cancel
  }
}
</script>

<template>
  <div>
    <AppHeader title="画图模型管理" show-back />
    <div class="p-3">
      <div class="usage-tip">
        <span class="tip-icon">💡</span>
        <span>在「对话」中直接说"画一个…"即可调用此处配置的默认画图模型，无需切换页面。</span>
      </div>

      <CellGroup v-if="store.configs.length && isDesktop" inset>
        <Cell
          v-for="c in store.configs"
          :key="c.id"
          :title="c.name"
        >
          <template #label>
            <span class="model-meta">{{ c.model }} · {{ c.default_size }}</span>
          </template>
          <template #value>
            <div class="flex items-center justify-end gap-1.5">
              <Tag v-if="c.is_default" type="success" round>默认</Tag>
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
                type="success"
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
            @click="toggleActions(c.id)"
          >
            <template #label>
              <span class="model-meta">{{ c.model }} · {{ c.default_size }}</span>
            </template>
            <template #value>
              <Tag v-if="c.is_default" type="success" round>默认</Tag>
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
              type="success"
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
              <Button v-if="!c.is_default" square type="success" text="设为默认" @click="setDefault(c.id)" />
            </div>
          </template>
        </SwipeCell>
      </CellGroup>

      <Empty v-else description="还没有配置">
        <Button type="primary" round @click="add">+ 新增配置</Button>
      </Empty>

      <div v-if="store.configs.length" class="mt-4 space-y-2">
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

.model-meta {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
