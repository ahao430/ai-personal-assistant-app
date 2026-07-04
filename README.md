# AI 个人助手

Tauri + Vue 3 实现的个人助手应用，支持会话、待办、日程、日报、模型配置、画图、WebDAV 备份同步和 Cloudflare Workers 信令。

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

发布 tag 与版本号一致，例如 `v0.0.4`。GitHub Actions 会在 tag 推送后构建 Windows、macOS universal 和 Android APK，并发布到 Releases。
