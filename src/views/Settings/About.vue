<script setup lang="ts">
import { ref } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import { Cell, CellGroup, Button, showConfirmDialog, showToast } from "vant";
import { openUrl } from "@tauri-apps/plugin-opener";

// 同步更新：package.json / Cargo.toml / tauri.conf.json 都需要改
const APP_VERSION = "0.0.4";
const REPO_OWNER = "ahao430";
const REPO_NAME = "ai-personal-assistant-app";
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;
const API_LATEST = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

interface GithubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string;
  prerelease: boolean;
}

const checking = ref(false);
const latestInfo = ref<GithubRelease | null>(null);
const lastCheckedAt = ref<number | null>(null);

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

function compareVersion(a: string, b: string): number {
  const aa = parseVersion(a);
  const bb = parseVersion(b);
  const len = Math.max(aa.length, bb.length);
  for (let i = 0; i < len; i++) {
    const x = aa[i] ?? 0;
    const y = bb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function openExternal(url: string) {
  try {
    if (typeof openUrl === "function") {
      await openUrl(url);
    } else {
      window.open(url, "_blank");
    }
  } catch {
    window.open(url, "_blank");
  }
}

async function checkUpdate() {
  if (checking.value) return;
  checking.value = true;
  try {
    const resp = await fetch(API_LATEST, { headers: { Accept: "application/vnd.github+json" } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as GithubRelease;
    latestInfo.value = data;
    lastCheckedAt.value = Date.now();

    const cmp = compareVersion(data.tag_name, APP_VERSION);
    if (cmp <= 0) {
      showToast(`已是最新版 (v${APP_VERSION})`);
      return;
    }

    showConfirmDialog({
      title: `发现新版本 ${data.tag_name}`,
      message: data.body?.slice(0, 500) || "点击升级跳转 GitHub Releases 下载页面。",
      confirmButtonText: "立即升级",
      cancelButtonText: "稍后",
    })
      .then(() => openExternal(`${REPO_URL}/releases/latest`))
      .catch(() => {});
  } catch (e) {
    showToast("检查失败：" + String(e));
  } finally {
    checking.value = false;
  }
}

async function copyVersion() {
  try {
    await navigator.clipboard.writeText(APP_VERSION);
    showToast("已复制版本号");
  } catch {
    showToast("复制失败");
  }
}

function latestLabel(): string {
  if (!latestInfo.value) return "未检测";
  return latestInfo.value.tag_name;
}
</script>

<template>
  <div class="min-h-full bg-stone-50">
    <AppHeader title="关于" show-back />

    <div class="space-y-4 p-4">
      <!-- Hero -->
      <section
        class="flex flex-col items-center rounded-3xl bg-white p-6 shadow-card ring-1 ring-stone-100"
      >
        <img
          src="/app-icon.png"
          alt="AI 助手"
          class="h-20 w-20 rounded-3xl shadow-sm"
        />
        <h1 class="mt-3 text-lg font-semibold text-stone-800">AI 助手</h1>
        <p class="mt-1 text-xs text-stone-500">个人 AI 助手 · 跨端同步</p>
        <button
          class="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition active:scale-95"
          @click="copyVersion"
        >
          v{{ APP_VERSION }}
          <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        </button>
      </section>

      <!-- 版本信息 -->
      <CellGroup title="版本信息" inset>
        <Cell title="当前版本" :value="`v${APP_VERSION}`" @click="copyVersion" />
        <Cell title="最新版本">
          <template #value>
            <span
              class="text-xs"
              :class="latestInfo && compareVersion(latestInfo.tag_name, APP_VERSION) > 0
                ? 'font-medium text-accent-600'
                : 'text-stone-500'"
            >
              {{ latestLabel() }}
            </span>
          </template>
        </Cell>
        <Cell
          v-if="lastCheckedAt"
          title="上次检测"
          :value="new Date(lastCheckedAt).toLocaleTimeString('zh-CN')"
        />
      </CellGroup>

      <!-- 仓库 -->
      <CellGroup title="项目" inset>
        <Cell title="GitHub 仓库" :value="`${REPO_OWNER}/${REPO_NAME}`" is-link @click="openExternal(REPO_URL)" />
        <Cell
          title="Releases"
          value="最新版下载"
          is-link
          @click="openExternal(`${REPO_URL}/releases/latest`)"
        />
        <Cell
          title="Issues"
          value="反馈与建议"
          is-link
          @click="openExternal(`${REPO_URL}/issues`)"
        />
        <Cell title="开源协议" value="MIT" />
      </CellGroup>

      <!-- 检查更新 -->
      <Button
        block
        type="primary"
        :loading="checking"
        @click="checkUpdate"
      >
        {{ checking ? "正在检查…" : "检查更新" }}
      </Button>

      <p class="px-4 text-center text-xs leading-relaxed text-stone-400">
        本应用完全开源免费，遵守 MIT 协议。<br />
        如有问题欢迎在 GitHub Issues 反馈。
      </p>
    </div>
  </div>
</template>
