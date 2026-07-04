# 信令服务（Cloudflare Workers）

为 AI 助手 App 提供「跨设备实时同步通知」能力。数据走 WebDAV，本服务只负责通知「哪张表变了」，不缓存消息内容。

## 部署

```bash
cd worker
pnpm install         # 或 npm install
npx wrangler login   # 首次
pnpm deploy
```

部署后拿到地址，类似：
```
https://ai-assistant-signaling.<your-subdomain>.workers.dev
```

## 在 App 中配置

进入 设置 → 同步 → 信令服务，填入：
```
wss://ai-assistant-signaling.<your-subdomain>.workers.dev/ws?device=<deviceId>
```

`deviceId` 是 App 自动生成的 UUID，区分不同设备。也可以多设备共用同一 deviceId（不推荐，会互相踢）。

## 协议

### 设备 → 服务端

```json
{ "type": "hello", "deviceId": "..." }     // 连接时自动发
{ "type": "update", "table": "todos" }     // 本地有变更后发
{ "type": "ping" }
```

### 服务端 → 设备

```json
{ "type": "hello", "deviceId": "...", "online": 2 }
{ "type": "update", "table": "todos", "from": "device-xxx", "ts": 1735900000000 }
{ "type": "pong" }
```

收到 `update` 时，App 自动从 WebDAV 拉对应表（`todos.json` / `chat/YYYY/MM/DD.json`）合并到本地 SQLite。

## 限制

- 单房间（单人）设计；多用户场景需要改造 DO 命名空间（按用户分房间）
- 免费额度：10 万 req/天 + 100 万 WS msg/月，单人用绰绰有余
- 不持久化消息（断线期间错过的更新由 App 通过 manifest 校对补齐）

## 自建替代方案

如果不想用 Cloudflare Workers，把这个 `src/index.ts` 重写为 Node.js（`ws` + `express`）即可，逻辑相同：
```bash
# 伪代码
npm i ws express
node server.js  # 跑在你的 VPS 上
```
