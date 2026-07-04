# 个人 AI 助手 App 规划

## 一、产品定位

面向**工作与生活场景**的个人 AI 助手。核心能力：

- 日常对话（自定义大模型）
- 日历 + Todo 任务管理
- 定时提醒（本地通知）
- 每日会话汇总日报（AI 自动生成）
- 多端数据同步（WebDAV）

**目标平台**：Android（主），桌面端 Windows / macOS（次）。
**技术栈**：Tauri 2 + Vue 3 (`<script setup>` + TS) + SQLite + WebDAV。

---

## 二、技术选型

| 层 | 技术 | 说明 |
|---|---|---|
| 壳 | Tauri 2 | 一套代码出 Android apk 与桌面端，体积小 |
| 前端 | Vue 3 + Vite + TS + Pinia + Vue Router | Composition API，遵循 `vue-best-practices` |
| UI | Vant 4（移动优先） + Tailwind | 移动端为主，桌面端响应式适配 |
| 数据库 | SQLite (Tauri `sql` 插件) | 按日期分表 / 分区存储聊天 |
| 同步 | WebDAV（Rust 端 `reqwest` + `webdav` crate） | 增量同步，文件级冲突合并 |
| 大模型 | 用户自定义（OpenAI 兼容协议） | 支持 Base URL + API Key + Model |
| 画图 | 用户自定义（OpenAI 兼容 `images.generations`） | gpt-image / DALL·E / SDWeb 兼容协议 |
| 通知 | Tauri `notification` + `alarm`/Android 前台服务 | 定时提醒 |
| 任务调度 | Rust 端 `tokio` 定时任务 | 日报、提醒 |

---

## 三、数据模型（SQLite）

```sql
-- 聊天会话（按日期分表：chat_20260702）
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,          -- uuid
  role TEXT,                    -- user / assistant / system
  content TEXT,                 -- 文本内容（图片走 attachments）
  model TEXT,
  tokens INTEGER,
  attachments TEXT,             -- JSON: [{type:image, path, width, height}]
  created_at INTEGER            -- unix ms
);

-- Todo 任务
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  status TEXT,                  -- pending / done / archived
  priority INTEGER,
  due_at INTEGER,               -- 截止时间
  remind_at INTEGER,            -- 提醒时间
  created_at INTEGER,
  updated_at INTEGER
);

-- 日历事件
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  start_at INTEGER,
  end_at INTEGER,
  all_day INTEGER,
  location TEXT,
  recurrence TEXT,              -- iCal RRULE
  created_at INTEGER,
  updated_at INTEGER
);

-- 每日日报
CREATE TABLE daily_reports (
  date TEXT PRIMARY KEY,         -- YYYY-MM-DD
  summary TEXT,
  todo_done INTEGER,
  todo_pending INTEGER,
  events_count INTEGER,
  raw_stats TEXT,                -- JSON
  created_at INTEGER
);

-- 大模型配置
CREATE TABLE llm_configs (
  id TEXT PRIMARY KEY,
  name TEXT,
  base_url TEXT,
  api_key TEXT,                  -- 加密存储
  model TEXT,
  is_default INTEGER,
  params TEXT                    -- JSON: temperature 等
);

-- 画图模型配置（OpenAI 兼容 images.generations）
CREATE TABLE image_configs (
  id TEXT PRIMARY KEY,
  name TEXT,
  base_url TEXT,                 -- 例 https://api.openai.com/v1
  api_key TEXT,                  -- 加密存储
  model TEXT,                    -- gpt-image-1 / dall-e-3 / sd-xL 等
  default_size TEXT,             -- 1024x1024 / 1536x1024
  default_quality TEXT,          -- low / medium / high
  is_default INTEGER
);

-- 同步状态
CREATE TABLE sync_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  synced_at INTEGER
);
```

---

## 四、页面规划

### 1. 启动 / 同步页（Splash + Sync）
- App 冷启动时检查 WebDAV 增量 + 订阅信令服务
- 冲突提示（极少触发）

### 2. 主对话页（Chat）★ 核心
- 消息流（按日期分组）
- 输入框 + 快捷指令（"/添加提醒"、"\/新建任务"、"/画图 描述"）
- 富文本消息：图片缩略图、长按保存到相册、点击查看大图
- 图片生成中显示占位骨架 + 进度
- 上下文菜单：复制、重新生成、加入日报、用图作输入（图生图）
- 顶部：模型切换、画图模型切换、清空当日会话、**刷新同步按钮**（旋转动画表示同步中）

### 3. 今日 Dashboard（Home）
- 顶部：日期 + 问候 + 今日 AI 一句话 + **刷新同步按钮**
- 卡片 1：今日日程（事件列表）
- 卡片 2：待办任务（按优先级）
- 卡片 3：昨日日报摘要
- 卡片 4：快捷入口（新建对话、新建任务、新建事件）

### 4. 日历页（Calendar）
- 月视图 + 日视图切换
- 点击日期查看当天事件 + 聊天 + 任务
- 长按新建事件

### 5. Todo 页（Tasks）
- 列表 + 筛选（今日 / 本周 / 全部 / 已完成）
- 滑动完成 / 删除
- 优先级颜色标签
- 关联到对话（从对话生成的任务）

### 6. 日报页（Daily Report）
- 列表：按日期倒序
- 详情：当日对话摘要 + 完成任务 + 事件 + AI 洞察
- 支持手动编辑、导出 Markdown

### 7. 提醒页（Reminders）
- 即将到来 / 已过期
- 关联源：任务 / 事件 / 自定义

### 8. 设置页（Settings）
- **大模型管理**：配置多个，设默认
- **画图模型管理**：配置多个 OpenAI 兼容画图服务，设默认
- **WebDAV 配置**：URL、账号、密码、自动同步频率
- **信令服务**：Workers URL、设备 ID、连接状态
- **Agent 人设**：默认提示词编辑（偏工作 / 生活切换）
- **通知**：权限、提前提醒时间
- **数据**：导出 / 导入 / 清理 / 手动同步
- **关于**：版本、反馈

---

## 五、Agent 提示词策略

默认 system prompt 偏**工作 + 生活双模式**：

```
你是一位贴心且高效的个人助手。你的目标是：
1. 帮用户高效处理工作任务（日程、待办、信息整理）
2. 适度关心生活与健康（提醒休息、运动、饮水）
3. 当识别到用户提到时间/任务时，主动建议创建 todo 或事件
4. 回答简洁、可执行，避免空话
5. 当用户要求画图 / 生成图片 / 画一张时，调用 image_gen 工具

可用工具：
- create_todo(title, due_at?)
- create_event(title, start_at, end_at?)
- image_gen(prompt, size?)   # 生成图片，返回本地路径
- search_web(query)          # 可选

当前时间：{now}
用户位置：{location}
今日待办：{today_todos}
今日日程：{today_events}
```

可在设置中切换「工作模式 / 生活模式 / 均衡」。

---

## 六、关键技术点

### 6.1 SQLite 按日期存储
- 聊天表按日期动态建表：`chat_YYYYMMDD`
- 查询优化：跨天搜索走 `UNION ALL` + 索引
- 备份：直接复制 db 文件到 WebDAV

### 6.2 同步策略：WebDAV 持久 + Workers 实时中转

**核心问题**：WebDAV 是文件协议，没有推送；且按"天"存 DB 文件意味着每条新消息都得重传整天 → 流量与延迟都不可接受。

**双通道架构**：

| 通道 | 角色 | 延迟 | 失效后果 |
|---|---|---|---|
| **Workers WebSocket** | 在线设备实时中转，缓存最近 N 条 | ~几十 ms | 仅失去实时性 |
| **WebDAV** | 持久存储 + 冷启动恢复 + 离线兜底 | ~几百 ms | 数据不丢 |

**为什么这样选**：
- 数据所有权归用户（Workers 重启后从 WebDAV 重建，不存历史）
- Workers 免费额度对单人够用
- 双通道互为兜底，挂任何一个都能工作

#### 文件粒度（关键修正）

不是按"天"分 DB，而是按"消息"分文件：

```
webdav:///chat/2026/07/03/
├── manifest.json              # 当日水位：最后 msgId、各设备最后上传时间
├── msgs/
│   ├── <uuid>.json            # 单条消息 ~1KB
│   └── ...
└── compacted.jsonl            # 次日凌晨合并当日所有 msgs/ → 单文件（冷启动只读这一个）
```

- 发消息：本地写 SQLite → PUT `<uuid>.json` → 更新 `manifest.json` → 推 Workers
- 收消息（在线）：Workers 推 `{date, msgId}` → 设备直接从 Workers 缓存取（不走 WebDAV）
- 收消息（冷启动）：拉 `manifest.json` → 比对本地水位 → 拉缺失的 `compacted.jsonl` + 增量 `msgs/`

其他表（todos / events / reports）小且改动稀疏，**仍可按表整体同步**：
- `/todos.db`、`/events.db`、`/reports.db`
- 基于 ETag 增量，改动频率天然低，全文件重传可接受

#### 写入与同步流程

```
用户发消息
  ↓
1. 写本地 SQLite (chat_messages)
  ↓
2. PUT webdav /chat/.../msgs/<uuid>.json     (~1KB)
  ↓
3. PUT webdav /chat/.../manifest.json         (更新水位)
  ↓
4. 发 Workers WS: {type:"msg", date, msgId, payload}
  ↓
在线对端收到 → 直接渲染 payload → 异步落本地 SQLite
离线对端：下次上线拉 manifest → 补漏
```

#### 触发同步的时机（三层兜底）

1. **自动**：App 启动、切回前台、收到 Workers 推送
2. **定时**：后台每 5 分钟拉 manifest 比对（可配置）
3. **手动**：顶部刷新按钮 → 强制拉 manifest + 重传本地未确认消息

#### 冲突解决

- 消息按 UUID 主键，天然无冲突
- 删除/编辑：写入"墓碑"消息（`{type:"tombstone", ref:<msgId>}`），不物理删
- todos/events 修改冲突：以 `_conflict_TIMESTAMP` 保留双方，提示用户选择

#### 信令服务实现

Cloudflare Workers + Durable Object：
- Durable Object 维护"房间"（单人 = 一个房间）
- 内存缓存最近 100 条消息（OOM 安全）
- 重启时从 WebDAV `manifest.json` + 当日 `msgs/` 重建缓存
- 约 150 行 JS

### 6.3 定时提醒（Android）
- Tauri 2 前台服务 + AlarmManager
- 重启后恢复（开机自启）
- 通知点击跳转到对应任务 / 对话

### 6.4 每日日报
- 每日 23:00 自动触发
- 收集：当日对话、完成任务、事件
- 调用 LLM 生成结构化摘要（JSON → 渲染）
- 失败重试 3 次，失败后留空模板

### 6.5 画图能力
- **协议**：OpenAI 兼容 `POST /v1/images/generations`，参数 `prompt / model / size / quality / n`
- **接入**：Rust 端封装 `image_gen`，作为 LLM 的 function tool 暴露给对话
- **编辑（可选）**：支持 `images/edits`，传入已有图片 + mask 做局部修改
- **存储**：原图存 `app_data/images/YYYY/MM/`，缩略图（256px）以 BLOB 入 SQLite
- **同步**：图片走 WebDAV `/images/YYYY/MM/` 目录，缩略图随 db 文件同步
- **成本控制**：默认 size 1024x1024 + quality medium；设置页可改默认；超出阈值（如 >5 张/小时）软提醒
- **失败处理**：超时 60s，重试 1 次，失败提示用户

---

## 七、开发路线（建议 4 个里程碑）

### M1 — 骨架（1 周）
- Tauri 2 项目初始化（Android + 桌面端）
- SQLite 集成、基础 Schema
- 路由 + 主框架（底部 Tab：今日 / 对话 / 日历 / 我的）

### M2 — 对话 + 大模型 + 画图（1-1.5 周）
- 大模型配置页
- 画图模型配置页
- 对话页 + 流式响应 + function calling
- `image_gen` 工具接入，对话中生成并展示图片
- 自定义 system prompt

### M3 — Todo / 日历 / 提醒（1-2 周）
- Todo CRUD
- 日历视图
- 本地通知（Android 前台服务）

### M4 — 同步 + 日报（1 周）
- WebDAV 同步 + Cloudflare Workers 信令服务
- 三层同步触发（自动 / 定时 / 手动刷新按钮）
- 日报自动生成
- 冲突处理、导出 Markdown

---

## 八、目录结构（建议）

```
ai-personal-assistant-app/
├── src/                          # Vue 前端
│   ├── views/
│   │   ├── Dashboard.vue
│   │   ├── Chat.vue
│   │   ├── Calendar.vue
│   │   ├── Tasks.vue
│   │   ├── DailyReport.vue
│   │   └── Settings/
│   ├── components/
│   ├── stores/                   # Pinia
│   ├── router/
│   ├── api/                      # Tauri invoke 封装
│   ├── utils/
│   └── App.vue
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── db/                   # SQLite
│   │   ├── llm/                  # 大模型调用（含 function calling）
│   │   ├── image/                # 画图调用（OpenAI 兼容）
│   │   ├── sync/                 # WebDAV + 信令订阅
│   │   ├── scheduler/            # 定时任务
│   │   └── notification/         # 通知
│   └── Cargo.toml
├── package.json
├── worker/                        # Cloudflare Workers 信令服务（独立部署）
│   ├── src/index.ts
│   └── wrangler.toml
└── plan.md
```

---

## 九、风险与注意点

1. **Android 后台保活**：国内厂商限制严格，需要引导用户加白名单
2. **WebDAV 兼容性**：坚果云、NextCloud、群晖行为差异大，需要兼容测试
3. **大模型 API Key 安全**：用 Tauri keychain 或加密存储
4. **SQLite 并发**：前端读取走 Rust，避免直接多连接写入
5. **跨时区**：日历事件统一存 UTC，显示用本地时区
6. **信令服务可用性**：Workers 挂了不影响数据完整性，只影响实时性，定时 + 手动刷新兜底
