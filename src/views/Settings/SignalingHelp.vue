<script setup lang="ts">
import { ref } from "vue";
import AppHeader from "@/components/AppHeader.vue";
import { showToast } from "vant";

interface Step {
  title: string;
  desc?: string;
  code?: string;
  codeLang?: string;
  hint?: string;
}

const intro = {
  what: "跨设备实时通知服务。当你在一台设备发消息、改任务或日程，其他在线设备会秒级收到通知去 WebDAV 拉数据。信令本身不缓存任何内容。",
  fallback: "不配置信令也能正常使用，App 会退化为「定时同步 + 手动刷新」。配置信令只是为了让同步更即时。",
  once: "在你本地电脑跑一次 wrangler deploy（5 分钟），Worker 会上传到 Cloudflare 全球边缘网络长期运行。你电脑关机/重装都不影响，任何设备任何网络都能连。",
};

const steps: Step[] = [
  {
    title: "注册 Cloudflare 账号",
    desc: "Cloudflare Workers 提供免费额度，足够个人使用。打开下面的网址注册：",
    code: "https://dash.cloudflare.com/sign-up",
  },
  {
    title: "安装 Wrangler 命令行工具",
    desc: "Wrangler 是 Cloudflare 的部署工具，只需要在任意一台能联网的电脑上跑一次（你本地开发机就行）；每台设备不用都装。",
    code: "npm install -g wrangler\nwrangler login",
    hint: "「wrangler login」会打开浏览器让你授权 Cloudflare 账号。",
  },
  {
    title: "拉取代码并部署 Worker",
    desc: "本项目的信令服务源码在 worker/ 目录。在本地电脑跑一次部署命令，Worker 会上传到 Cloudflare 全球边缘网络运行：",
    code: "cd worker\nnpm install\nnpm run deploy",
    hint: "部署完本地代码就可以删了，Worker 已经在 Cloudflare 上跑，不依赖你电脑。首次约 30 秒，成功会输出一段 URL。",
  },
  {
    title: "回到 App 填入 WebSocket URL",
    desc: "填写部署输出的 WebSocket 地址即可，设备 ID 用下面单独的字段：",
    code: "wss://<your-worker-name>.<your-subdomain>.workers.dev/ws",
    hint: "每台设备填同一个 WebSocket URL；设备 ID 字段已经自动生成，连接时会自动作为 device 参数使用。",
  },
  {
    title: "点「连接信令」按钮",
    desc: "回到上一页，点底部的「连接信令」按钮。状态显示「已连接」即成功。",
  },
];

const deployPrompt = `请帮我用 shell 一键创建并部署这个 App 的 Cloudflare Workers 信令服务，不要依赖 GitHub 或 git clone。

请在任意一台能联网的电脑（本地开发机即可，不需要服务器）的终端执行下面的完整命令：

cat > install-ai-assistant-signaling.sh <<'SCRIPT'
set -e
mkdir -p ai-assistant-signaling/src
cd ai-assistant-signaling

cat > package.json <<'EOF'
{
  "name": "ai-assistant-signaling",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "tail": "wrangler tail"
  },
  "devDependencies": {
    "wrangler": "^3.99.0",
    "@cloudflare/workers-types": "^4.20251210.0",
    "typescript": "^5.7.0"
  }
}
EOF

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["@cloudflare/workers-types"],
    "lib": ["ES2022"],
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
EOF

cat > wrangler.toml <<'EOF'
name = "ai-assistant-signaling"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[[durable_objects.bindings]]
name = "ROOM"
class_name = "RoomObject"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RoomObject"]
EOF

cat > src/index.ts <<'EOF'
export interface Env {
  ROOM: DurableObjectNamespace;
}

interface DeviceConn {
  deviceId: string;
  ws: WebSocket;
}

export class RoomObject implements DurableObject {
  conns: Map<string, DeviceConn> = new Map();

  async fetch(req: Request): Promise<Response> {
    const upgrade = req.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const url = new URL(req.url);
    const deviceId = url.searchParams.get("device") || "anon";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    const conn: DeviceConn = { deviceId, ws: server };
    this.conns.set(deviceId, conn);
    server.send(JSON.stringify({ type: "hello", deviceId, online: this.conns.size }));

    server.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        if (msg?.type === "update" && typeof msg.table === "string") {
          const envelope = { type: "update", table: msg.table, from: deviceId, ts: Date.now() };
          for (const c of this.conns.values()) {
            if (c.deviceId !== deviceId) {
              try {
                c.ws.send(JSON.stringify(envelope));
              } catch {}
            }
          }
        } else if (msg?.type === "ping") {
          server.send(JSON.stringify({ type: "pong" }));
        }
      } catch {}
    });

    server.addEventListener("close", () => this.conns.delete(deviceId));
    server.addEventListener("error", () => this.conns.delete(deviceId));

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/ws") {
      const id = env.ROOM.idFromName("global");
      const stub = env.ROOM.get(id);
      return stub.fetch(req);
    }
    return new Response("Not Found", { status: 404 });
  },
};
EOF

npm install
npx wrangler login
npm run deploy
SCRIPT

sh install-ai-assistant-signaling.sh

部署完成后，请把输出的 workers.dev 地址整理成 App 里填写的 WebSocket URL：
wss://<worker-name>.<subdomain>.workers.dev/ws

注意：URL 不要手动拼 device 参数，App 里有单独的设备 ID 字段，连接时会自动添加。`;

const faqs = [
  {
    q: "是不是每台设备都要部署信令服务？",
    a: "不是。信令服务只需要在你本地电脑跑一次 wrangler deploy 部署到 Cloudflare，Worker 在 Cloudflare 全球边缘网络长期运行，跟你电脑开不开机无关。每台设备只要在 App 里填写同一个 WebSocket URL，并使用各自自动生成的设备 ID。",
  },
  {
    q: "一个设备配置好后，其他设备只用 WebDAV 同步就行吗？",
    a: "核心数据同步靠 WebDAV。其他设备安装 App 后，配置同一套 WebDAV 地址和账号，再执行同步即可拿到数据；信令地址如果也同步/填写上，只是让后续变化能更快通知。",
  },
  {
    q: "需要花钱吗？",
    a: "不需要。Cloudflare Workers 免费额度 10 万请求/天 + 100 万 WebSocket 消息/月，个人使用远远用不完。",
  },
  {
    q: "多设备怎么配？",
    a: "每台设备装一份 App，各自生成自己的设备 ID（自动），WebSocket URL 填同一个服务地址即可。不要多端共用同一设备 ID，会互相踢下线。",
  },
  {
    q: "不想用 Cloudflare 怎么办？",
    a: "可以把 worker/src/index.ts 改写成 Node.js（ws + express），跑在自己的 VPS 上，逻辑相同。",
  },
  {
    q: "能不能集成到桌面端 App 里，省掉这次部署？",
    a: "不行。信令服务本质需要「公网可达 + 24/7 在线」，桌面端 App 关机/休眠就没了，家庭网络通常也没公网 IP，手机出门用 4G 根本连不到你电脑。Cloudflare Workers 不在你电脑上跑——是在 Cloudflare 边缘节点跑——所以你电脑关了也不影响。这就是为什么必须部署到 Cloudflare（或别的云）。",
  },
  {
    q: "断网期间的消息会丢吗？",
    a: "不会。信令只负责通知，数据本身在 WebDAV。重新上线后 App 会通过 manifest 校对补齐缺失的更新。",
  },
];

async function copyDeployPrompt() {
  await copy(deployPrompt);
  copiedKey.value = "deploy-prompt";
  setTimeout(() => {
    if (copiedKey.value === "deploy-prompt") copiedKey.value = null;
  }, 1500);
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("已复制");
  } catch {
    showToast("复制失败");
  }
}

const copiedKey = ref<string | null>(null);
async function copyStep(step: Step, idx: number) {
  if (!step.code) return;
  await copy(step.code);
  copiedKey.value = `step-${idx}`;
  setTimeout(() => {
    if (copiedKey.value === `step-${idx}`) copiedKey.value = null;
  }, 1500);
}
</script>

<template>
  <div class="min-h-full bg-stone-50">
    <AppHeader title="信令配置说明" show-back />

    <div class="space-y-4 p-4">
      <!-- 这是什么 -->
      <section
        class="rounded-2xl bg-brand-600 p-4 text-white shadow-card"
      >
        <div class="mb-2 flex items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
            </svg>
          </span>
          <h2 class="text-base font-semibold">这是什么</h2>
        </div>
        <p class="text-sm leading-relaxed text-white/90">{{ intro.what }}</p>
        <p class="mt-2 rounded-lg bg-white/10 px-2 py-1.5 text-xs leading-relaxed text-white/90">{{ intro.once }}</p>
        <p class="mt-2 text-xs leading-relaxed text-white/75">{{ intro.fallback }}</p>
      </section>

      <section
        class="rounded-2xl bg-white p-4 shadow-card ring-1 ring-stone-100"
      >
        <div class="mb-2 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-stone-800">给 Claude Code 的部署提示词</h2>
            <p class="mt-1 text-xs leading-relaxed text-stone-500">
              复制后粘贴给 Claude Code、Cursor 等工具，让它用 shell 一键创建并部署 Cloudflare Workers 信令服务。
            </p>
          </div>
          <button
            class="shrink-0 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition active:scale-95"
            @click="copyDeployPrompt"
          >
            {{ copiedKey === "deploy-prompt" ? "已复制" : "复制提示词" }}
          </button>
        </div>
        <pre class="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-stone-900 px-3 py-2 text-[12px] leading-relaxed text-stone-100">{{ deployPrompt }}</pre>
      </section>

      <!-- 步骤 -->
      <section>
        <h3 class="mb-3 px-1 text-sm font-semibold text-stone-800">
          部署步骤 <span class="text-xs text-stone-400">5 步 · 约 5 分钟 · 一次性</span>
        </h3>
        <ol class="space-y-3">
          <li
            v-for="(s, i) in steps"
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
                @click="copyStep(s, i)"
              >
                {{ copiedKey === `step-${i}` ? "已复制" : "复制" }}
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
