# Text Selector 1.2.0 — 诊断性修复版本

本版本把所有 Metro 查找从插件顶层移到 onLoad，避免异常导致扳手变灰；修复 `openLazy` 的 importer 函数误处理。

## 验证

安装/更新后完整关闭并重开 Discord。若看到启动 Toast，打开插件设置查看「启动状态」，再长按文字消息。若仍然没有菜单入口，将启动状态/日志与客户端版本截图反馈。

> 注意：仅通过语法和模拟测试，尚未在你的手机上实测，不能保证所有 Discord/插件框架版本的消息菜单都能挂接。

## 发布

上传本项目全部内容覆盖原仓库，确保 `docs/index.js` 和 `docs/manifest.json` 一起更新。GitHub Pages 仍选择 `main /docs`。原安装 URL 不变。
