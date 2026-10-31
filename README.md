# Text Selector · 编辑文字（Bunny / Vendetta）

独立的 Discord 手机端插件。在**长按文字消息**的菜单中尝试添加「编辑文字」入口，以原文打开可选择的文字窗口。你可以长按文字、拖动系统选择手柄、复制一小段，不需要手动重打，也不会修改 Discord 服务器上的消息。

## 安装（手机 GitHub 上传，无需编译）

1. 下载本项目 ZIP 并解压。
2. 在 GitHub 新建公开仓库，建议名字：`text-selector-bunny`。
3. 选择 **Add file → Upload files**，把解压后的**所有文件和文件夹**上传到仓库根目录（不是上传 ZIP 本身）。确保根目录有 `docs/`、`src/`、`manifest.json`、`README.md`。
4. 进入仓库 **Settings → Pages → Build and deployment**，选择 **Deploy from a branch**；Branch 为 `main`，Folder 为 `/docs`，Save。
5. 页面部署成功后，在 Bunny / Vendetta 的 Plugins 页面安装：
   `https://GOGUtop.github.io/text-selector-bunny/`
   如果你的仓库名称不同，则相应更改链接的最后一段。
6. 长按有文字的消息，点「编辑文字」。在打开的窗口中长按文字，拖动选区手柄，再点 Android/iOS 系统菜单的「复制」。

可以先打开插件设置，点 **测试文字选择窗口**，确认系统文字选择正常，再测试消息长按菜单。

## 限制

- 适用于插件可读取到 `message.content` 的**文字消息**。图片中的字、附件、嵌入卡片里的复杂内容不会自动 OCR。
- 选区复制由手机操作系统提供；「复制全文」是备用按钮。
- 使用 Discord 的非公开内部 ActionSheet/ContextMenu 结构。Discord、Bunny、Vendetta、Revenge/Kettu 的不同版本可能改变菜单实现，因此 **未保证所有版本都出现按钮**。
- 已进行本地语法/模拟测试，**未在真实手机的 Discord 中实机验证**。
- 无网络请求、不上传消息、不修改服务器端内容、不需要输入账号密码。

## 修改与构建

无需依赖。Node.js 18+：

```sh
npm run build
npm test
```

`src/index.js` 是一个自包含插件表达式。构建会产生可直接托管在 GitHub Pages 的 `docs/index.js`、`docs/manifest.json` 和 `docs/README.md`，以及相同的 `dist/` 文件。不要只上传源码而忽略 `docs/`。

本项目独立于 `card2new`，无需覆盖原插件文件。
