# Text Selector v1.4.0 — 修复 Discord 351.11 点击「编辑文字」崩溃

## 本次修复

v1.3.0 已经能在长按菜单添加「编辑文字」，但打开选择窗口时，
使用了 `vendetta.ui.components.Alert`。在当前 Discord 351.11 + Revenge
客户端中，这个旧组件会尝试查找 `FluxContainer(Alert)`，随后崩溃，
提示 `bunny.metro.byDisplayName(FluxContainer(Alert)) is undefined!`。

v1.4.0 **完全不读取这个旧 Alert 组件**：保留已经成功的消息菜单注入，
将文字窗口改为使用 `vendetta.ui.alerts.showCustomAlert` 和 React Native 的
`View` / `ScrollView` / `Text selectable`，让系统原生长按文本选择手柄提供局部复制。
保留「复制全文」「关闭」按钮；不编辑、不发送原消息。

## 安装

1. 如果仍在崩溃界面，先点 `Reload in Safe Mode`，关闭旧插件。
2. 将此 ZIP 解压，上传**文件夹内部所有文件**到现有的 GitHub `text-selector-bunny` 仓库并覆盖旧文件。
3. 确保 GitHub Pages 仍为 `main` → `/docs`。
4. 等 `https://gogutop.github.io/text-selector-bunny/manifest.json` 显示 `1.4.0`。
5. 返回正常模式，在 Revenge 插件列表更新插件；必要时卸载后重新从原 URL 安装，然后重启 Discord。
6. 优先在插件设置页运行「测试文字选择窗口」，确认正常后再试消息长按。

安装地址仍为 `https://gogutop.github.io/text-selector-bunny/`。

## 限制

这里没有真实 Discord 351.11 运行环境，本地测试可证明代码**不再访问**
出错的旧 Alert 组件，但无法保证你手机上的新窗口已实际正常渲染。
若新窗口异常，请保留报错图；安全模式能帮助恢复。

## 源码构建和测试

```bash
npm run build
npm test
```

`src/index.js` 第一字符必须是 `(`，避免旧 Vendetta 插件加载器的自动分号插入问题。
