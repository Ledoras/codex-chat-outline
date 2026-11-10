# Codex 聊天目录

[English](README.md)

Codex Windows 客户端的本地阅读工具。在聊天右侧用一条菱形时间线标记提问，鼠标移上去即可展开带序号的目录，点击条目跳到对应位置。

- 滚动聊天时标出当前提问。长聊天可搜索提问，也可用方向键、Home、End 和 Enter 定位。
- 在目录的 **设置** 中切换简体中文和 English，分别调整目录背景色、不透明度和当前项颜色。选择 **应用并记住** 保存。
- 分别调整正文、界面和代码字号。展开动画遵循系统的减少动态效果设置。

## 开始使用

需要 Windows、通过 Microsoft Store 安装的 Codex，以及可在终端运行的 Node.js 22 或更新版本。

克隆本仓库后，在项目目录运行以下命令构建启动器。

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\Build-Launcher.ps1
```

双击 **CodexChatOutline.exe**，打开有提问记录的聊天，然后将鼠标移到右侧时间线上。保持生成的 EXE 与项目里的 `worker.cjs`、`navigator.js`、`font-override.js` 和 `integration.js` 放在同一个目录。

如果提示当前 Codex 没有开放本机连接，先完全退出 Codex，再双击启动器。启动器连接完成后会退出，目录在 Codex 打开期间持续运行。双击 **Stop-CodexChatOutline.exe** 可停用目录和字体设置。

## 本地数据

工具通过本机连接读取当前聊天中供界面定位的提问。配置保存在 `%LOCALAPPDATA%\CodexChatOutline`，聊天内容不会保存到该目录或上传。退出由启动器打开的 Codex 会结束其本机连接。
