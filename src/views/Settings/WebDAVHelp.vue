<script setup lang="ts">
import { ref } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import { showToast } from "vant";

interface Step {
  title: string;
  desc?: string;
  code?: string;
  hint?: string;
}

interface Provider {
  key: string;
  name: string;
  badge: string;
  badgeTone: "brand" | "amber";
  summary: string;
  steps: Step[];
}

const intro = {
  what: "WebDAV 是数据同步的「云盘」。你的对话、任务、日程、日报全部以 JSON 文件存到 WebDAV，多端读写同一份。信令服务只负责通知，真正的数据全在 WebDAV。",
  fallback: "不配 WebDAV 的话，数据只在本机，不能跨端同步，重装或换机会丢。",
};

const providers: Provider[] = [
  {
    key: "jianguoyun",
    name: "坚果云",
    badge: "推荐",
    badgeTone: "brand",
    summary: "国内访问稳定，免费账户每月 1GB 上行 + 3GB 下行，对个人助手完全够用。注册 → 开启 WebDAV → 填入 App，约 3 分钟。",
    steps: [
      {
        title: "注册坚果云账号",
        desc: "打开下面网址注册（免费，需邮箱 + 手机号验证）：",
        code: "https://www.jianguoyun.com",
      },
      {
        title: "登录网页版，进入账户安全设置",
        desc: "登录后：右上角头像 → 账户信息 → 安全选项",
      },
      {
        title: "添加应用，生成 WebDAV 专用密码",
        desc: "找到「第三方应用管理」→ 添加应用，名字随意（如「AI 助手」）。会生成一段随机密码，这是 WebDAV 专用密码，**不是登录密码**。",
        hint: "复制好这段密码，离开页面就看不到了。",
      },
      {
        title: "回到 App 填入",
        desc: "回到上一页，填入以下信息：",
        code: "URL:   https://dav.jianguoyun.com/dav/\n账号:  你注册的邮箱\n密码:  上一步生成的 WebDAV 密码",
        hint: "密码字段填 WebDAV 专用密码，不要填登录密码。",
      },
      {
        title: "点「保存 WebDAV」",
        desc: "回到上一页，点底部的「保存 WebDAV」按钮即可。",
      },
    ],
  },
  {
    key: "nas",
    name: "NAS 自建",
    badge: "无流量限制",
    badgeTone: "amber",
    summary: "适合家里已有群晖 / 威联通等 NAS 的用户。无月流量限制，数据完全自控。需要 NAS 能从外网访问（内网穿透 / 公网 IP / Tailscale）。",
    steps: [
      {
        title: "启用 NAS 的 WebDAV 服务",
        desc: "群晖：控制面板 → 文件服务 → WebDAV → 启用 HTTPS（端口 5006）。",
        hint: "威联通 QNAP：控制台 → 应用程序 → Web 服务器启用，再到网络与文件服务 → WebDAV 启用（默认端口 8081）。",
      },
      {
        title: "创建专用共享文件夹",
        desc: "新建一个文件夹（如 ai-assistant），专门给本 App 用，避免和其他数据混在一起。",
        code: "建议路径: /ai-assistant/",
      },
      {
        title: "创建专用账户，仅授权该文件夹",
        desc: "新建一个低权限账户，只授权访问上一步的文件夹。不要用 admin 账户，降低风险。",
      },
      {
        title: "外网访问（三选一）",
        desc: "NAS 在家里的话，外网访问需要任选一种方案：",
        code: "① 群晖 QuickConnect / 威联通 myQNAPcloud（最简单）\n② Tailscale（推荐，免费、加密、零配置）\n③ frp / Cloudflare Tunnel（自建）",
        hint: "纯内网用也行，但出门就用不了同步。",
      },
      {
        title: "回到 App 填入",
        desc: "URL 用 HTTPS（强烈推荐），路径末尾必须带斜杠：",
        code: "群晖: https://<nas-domain>:5006/ai-assistant/\nQNAP: https://<nas-domain>:8081/ai-assistant/",
      },
    ],
  },
  {
    key: "nextcloud",
    name: "NextCloud 自建",
    badge: "灵活",
    badgeTone: "amber",
    summary: "已有 VPS 或家庭服务器的用户可装 NextCloud，WebDAV 默认开启。Docker 一键部署，自带 Web UI + 多端同步。",
    steps: [
      {
        title: "部署 NextCloud",
        desc: "推荐 Docker Compose 一键起，文档：",
        code: "https://docs.nextcloud.com/server/latest/admin_manual/installation/",
      },
      {
        title: "创建应用密码",
        desc: "登录后：右上头像 → 设置 → 安全 → 设备与会话 → 创建新应用密码。",
      },
      {
        title: "填入 App",
        desc: "NextCloud 的 WebDAV 路径格式（注意路径要带上用户名）：",
        code: "https://<your-domain>/remote.php/dav/files/<username>/",
      },
    ],
  },
];

const activeProvider = ref<Provider>(providers[0]);

const faqs = [
  {
    q: "必须 HTTPS 吗？",
    a: "强烈推荐。HTTP 明文传输密码，会被运营商或公共 WiFi 劫持。坚果云和 NextCloud 默认 HTTPS；NAS 自建请配 SSL 证书（Let's Encrypt 免费）。",
  },
  {
    q: "URL 末尾的斜杠重要吗？",
    a: "重要。多数 WebDAV 服务器要求路径末尾带 /，否则会 405。如果保存失败，先检查这个。",
  },
  {
    q: "流量消耗大吗？",
    a: "单人用每天几 MB，每月 100MB 量级。聊天记录多的话会到几百 MB，坚果云免费额度够用。",
  },
  {
    q: "多个 App 能共用一个 WebDAV 吗？",
    a: "可以。建议在 WebDAV 根目录下给每个应用建一个子目录，URL 路径里指定。本 App 默认会建 ai-assistant/ 前缀。",
  },
  {
    q: "WebDAV 和信令能换不同服务器吗？",
    a: "可以完全独立。WebDAV 用坚果云、信令用 Cloudflare Worker，互不影响。",
  },
];

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("已复制");
  } catch {
    showToast("复制失败");
  }
}

const copiedKey = ref<string | null>(null);
async function copyStep(providerKey: string, idx: number, text: string) {
  await copy(text);
  copiedKey.value = `${providerKey}-${idx}`;
  setTimeout(() => {
    if (copiedKey.value === `${providerKey}-${idx}`) copiedKey.value = null;
  }, 1500);
}
</script>

<template>
  <div class="min-h-full bg-stone-50">
    <AppHeader title="WebDAV 配置说明" show-back />

    <div class="space-y-4 p-4">
      <!-- 这是什么 -->
      <section class="rounded-2xl bg-brand-600 p-4 text-white shadow-card">
        <div class="mb-2 flex items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M7 10l5 5 5-5" />
              <path d="M12 15V3" />
            </svg>
          </span>
          <h2 class="text-base font-semibold">这是什么</h2>
        </div>
        <p class="text-sm leading-relaxed text-white/90">{{ intro.what }}</p>
        <p class="mt-2 text-xs leading-relaxed text-white/75">{{ intro.fallback }}</p>
      </section>

      <!-- 提供商切换 -->
      <section>
        <h3 class="mb-2 px-1 text-sm font-semibold text-stone-800">选择 WebDAV 服务商</h3>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <button
            v-for="p in providers"
            :key="p.key"
            class="flex flex-shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition active:scale-95"
            :class="activeProvider.key === p.key
              ? 'bg-brand-600 text-white shadow-card'
              : 'bg-white text-stone-600 ring-1 ring-stone-200'"
            @click="activeProvider = p"
          >
            <span>{{ p.name }}</span>
            <span
              class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              :class="activeProvider.key === p.key
                ? 'bg-white/20 text-white'
                : p.badgeTone === 'brand'
                  ? 'bg-brand-50 text-brand-600'
                  : 'bg-accent-50 text-accent-600'"
            >
              {{ p.badge }}
            </span>
          </button>
        </div>
        <p class="mt-3 rounded-2xl bg-white p-3 text-xs leading-relaxed text-stone-600 shadow-card ring-1 ring-stone-100">
          {{ activeProvider.summary }}
        </p>
      </section>

      <!-- 当前提供商步骤 -->
      <section>
        <h3 class="mb-3 px-1 text-sm font-semibold text-stone-800">
          {{ activeProvider.name }} 配置步骤
        </h3>
        <ol class="space-y-3">
          <li
            v-for="(s, i) in activeProvider.steps"
            :key="i"
            class="rounded-2xl bg-white p-4 shadow-card ring-1 ring-stone-100"
          >
            <div class="mb-2 flex items-center gap-2">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {{ i + 1 }}
              </span>
              <h4 class="text-sm font-semibold text-stone-800">{{ s.title }}</h4>
            </div>
            <p v-if="s.desc" class="text-xs leading-relaxed text-stone-600">{{ s.desc }}</p>
            <div v-if="s.code" class="relative mt-2">
              <pre class="overflow-x-auto rounded-lg bg-stone-900 px-3 py-2 text-[12px] leading-relaxed text-stone-100">{{ s.code }}</pre>
              <button
                class="absolute right-1.5 top-1.5 rounded-md bg-white/10 px-2 py-0.5 text-[10px] text-white backdrop-blur transition active:scale-95"
                @click="copyStep(activeProvider.key, i, s.code!)"
              >
                {{ copiedKey === `${activeProvider.key}-${i}` ? "已复制" : "复制" }}
              </button>
            </div>
            <p v-if="s.hint" class="mt-2 flex items-start gap-1 text-[11px] leading-relaxed text-stone-500">
              <svg class="mt-0.5 h-3 w-3 flex-shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <span>{{ s.hint }}</span>
            </p>
          </li>
        </ol>
      </section>

      <!-- FAQ -->
      <section>
        <h3 class="mb-3 px-1 text-sm font-semibold text-stone-800">常见问题</h3>
        <div class="space-y-2">
          <details
            v-for="(f, i) in faqs"
            :key="i"
            class="group rounded-2xl bg-white p-3 shadow-card ring-1 ring-stone-100"
          >
            <summary class="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-stone-800">
              <span>{{ f.q }}</span>
              <svg class="h-4 w-4 text-stone-400 transition group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <p class="mt-2 text-xs leading-relaxed text-stone-600">{{ f.a }}</p>
          </details>
        </div>
      </section>
    </div>
  </div>
</template>
