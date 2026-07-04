# AI 个人助手

Tauri + Vue 3 实现的个人助手应用，支持会话、待办、日程、日报、模型配置、画图、WebDAV 备份同步和 Cloudflare Workers 信令。

## v0.0.6 更新

### 安卓

- 修复安卓 APK 无法安装（"解析软件包时出现问题"）的问题：CI 改用 debug 签名构建，跳过未配置 keystore 的限制。
- 后续若要正式分发，需要自签 keystore 并接入 CI signing 流程。

## v0.0.5 更新

### 对话

- 升级到 OpenAI 标准 tool calling（tool_calls / tools schema），保留本地执行。
- 工具调用面板：折叠展示参数和结果，状态图标 ⏳/🔧/⚠️，结果按 Markdown 渲染。
- 消息气泡 hover 显示「重新发送」和「删除」按钮。
- 删除消息后再点同步会强制覆盖远端（写入 sentinel 行让 `max(created_at)` 自动 bump）。
- 「新话题」分隔：旧消息保留但不进入后续上下文。
- 用户输入走纯文本，助手消息走 Markdown 渲染（github-markdown-css + github hljs）。
- 助手消息支持：Markdown、LaTeX 公式（自动把 `\[..\]` / `\(..\)` 转成 `$$..$$` / `$..$`）、Mermaid、PlantUML、代码高亮。
- 会话图片点击放大预览，支持滚轮缩放、双击切换、拖拽平移。
- 对话标题旁加 ⓘ 提示按钮，悬浮列出助理能力，备注文本模型需支持 tool calling。

### 画图

- 兼容 gpt-image-2：移除 `response_format`，强制 HTTP/1.1，超时延长到 180s。
- 画图模型设置页加蓝色提示卡：会话中说「画一个…」即可调用。
- 画图工具从「AI」板块移到「工具」板块。

### 天气

- 重写天气查询：拉取 current + hourly(24h) + daily(15d)。
- 输出 Markdown：标题 + 体感/湿度/风速/UV/日出日落 + 穿衣建议引用 + 24 小时表格 + 15 天表格，每行带天气 emoji。
- 新增「工具 → 天气工具」设置页：定位（反查 BigDataCloud）/ 手动输入城市，存到 local_kv。
- 定位被拒时提供「打开系统定位设置」按钮（macOS / Windows URL scheme）。
- LLM 工具调用没传 location 时回退到默认城市。

### 日历

- 当日事件下方新增「当日日报」卡片（摘要 + 完成/待办/事件 统计 + 跳转按钮）。
- 新增「本周周报」卡片（覆盖天数 X/7、统计聚合、首篇摘要）。

## v0.0.4 更新

- 会话支持内置工具：画图、查天气、添加待办、创建日程、生成日报。
- 画图结果在会话中展示，图片文件保存到本地并通过 WebDAV 的 `images/` 目录同步，聊天记录只保存相对路径。
- 查询天气时如果没有地点，会提示输入城市或允许定位，不再猜测默认位置。
- WebDAV 增量同步结果增加图片上传/下载数量。
- 待办列表勾选框与文字上下居中，并调整间距。
- 开发模式布局切换按钮移到左下角。
- 关于页下载入口统一指向 GitHub Releases latest。

## 发布

版本号需要同时更新：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src/views/Settings/About.vue`
- `src/views/Settings/index.vue`

发布 tag 与版本号一致，例如 `v0.0.5`。GitHub Actions 会在 tag 推送后构建 Windows、macOS universal 和 Android APK，并发布到 Releases。
