<script setup lang="ts">
import { ref, watch } from "vue";
import { resolveImageUrl } from "@/api/asset";

const props = defineProps<{
  path: string;
  remoteUrl?: string;
}>();

const src = ref("");

async function load() {
  if (props.remoteUrl) {
    src.value = props.remoteUrl;
    return;
  }
  src.value = await resolveImageUrl(props.path);
}

watch(() => props.path, load, { immediate: true });
</script>

<template>
  <img
    v-if="src"
    :src="src"
    class="block max-h-72 w-auto max-w-full"
    alt="generated"
  />
  <div v-else class="h-32 w-32 animate-pulse bg-gray-100"></div>
</template>
