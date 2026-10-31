# Text Selector v1.3.0 — 入口修复版

## 关键修复

旧版 `index.js` 以多行注释开始。Vendetta/旧版 Revenge 通过 `return ${plugin.js}` 执行插件，导致自动分号插入，入口求值结果为 `undefined`，插件没有运行。因此表现为蓝色启用开关但没有设置扳手、没有菜单项。

v1.3.0 让入口源码的首个字符就是 `(`，并在 `npm run build` 里增加与实际加载器等价的求值烟雾测试。如果将来再次出现此问题，打包会直接报错。

## 使用和安装

本包基于 v1.2.0 的菜单逻辑，重点修复了插件无法启动的问题。菜单注入尚未经过具体设备的实机验证，可能需要根据 Discord 版本再适配。

1. 解压后把所有文件（尤其 `docs/index.js` 和 `docs/manifest.json`）更新到原 `text-selector-bunny` 仓库；确保 GitHub Pages 发布目录仍为 `main` 的 `/docs`。
2. GitHub Pages 更新后查看 `https://gogutop.github.io/text-selector-bunny/manifest.json`，确认版本为 `1.3.0`。
3. 在 Discord 的 Revenge/Bunny 插件页面执行插件更新（如更新不生效，可卸载后重装），之后完全退出并重启 Discord。
4. 正常情况下：启用插件会提示“Text Selector 1.3 已启动”，扳手变为可用。点开设置页，可以点击“测试文字选择窗口”和“检查菜单注入状态”。
5. 如果仍没有长按菜单入口，请在插件设置里点“检查菜单注入状态”，把计数和错误消息发回来。这时插件应已运行，可从真实统计数据定位具体的菜单 API 差异。

## 安全性

插件不修改或发送 Discord 消息，不会上传文字内容。打开文字选择窗口后，使用系统文本选区手柄复制片段。

## 源码构建和测试

```bash
npm run build
npm test
```

`build.mjs` 内的加载器一致性检查是关键回归测试，不能删除。
