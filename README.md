# DeepSeek Immersive Translator

<p align="center">
  <img src="https://img.shields.io/badge/chrome-extension-4285F4" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/ai-deepseek-4f46e5" alt="DeepSeek">
</p>

<p align="center">
  <strong>A Chrome Extension that provides immersive bilingual webpage translation powered by DeepSeek.</strong>
  <br>
  <strong>一款由 DeepSeek 驱动的沉浸式双语网页翻译 Chrome 扩展。</strong>
</p>

---

## Overview
## 概述

DeepSeek Immersive Translator inserts bilingual translations beneath original webpage text — paragraph by paragraph — while preserving the original page layout. It uses the DeepSeek Chat API for high-quality translations and runs entirely in the browser.

DeepSeek Immersive Translator 在原始网页文本下方逐段插入双语翻译，同时保留原始页面布局。它使用 DeepSeek Chat API 提供高质量翻译，完全在浏览器中运行。

### Why This Extension
### 为什么选择这个扩展

- **Immersive Reading** — Translations appear directly beneath the original text. No toggling, no new tabs.
- **沉浸式阅读** — 译文直接显示在原文下方。无需切换，无需新标签页。
- **Privacy First** — Your API key is stored locally in Chrome storage. It is NEVER sent anywhere except to `api.deepseek.com`.
- **隐私优先** — API Key 仅存储在 Chrome 本地存储中。除 `api.deepseek.com` 外绝不发送至任何地方。
- **Layout Preserving** — Non-invasive DOM injection that respects React, Vue, and static websites.
- **保留布局** — 无侵入式 DOM 注入，兼容 React、Vue 和静态网站。
- **Cost Efficient** — Built-in translation cache, batching, and deduplication minimize API usage.
- **节约成本** — 内置翻译缓存、批量和去重机制，最小化 API 用量。
- **Open Source** — MIT licensed. No trackers, no analytics, no backend.
- **开源** — MIT 许可。无追踪器、无分析、无后端。

---

## Features
## 功能特性

- **Bilingual Translation** — Original text + translation displayed together
- **双语翻译** — 原文与译文同时显示
- **Paragraph Detection** — Intelligently identifies content, skips nav/ads/code
- **段落识别** — 智能识别正文内容，跳过导航/广告/代码
- **13 Languages** — Chinese, Japanese, Korean, French, German, Spanish, and more
- **13 种语言** — 中文、日语、韩语、法语、德语、西班牙语等
- **Two Display Modes** — Below-text or side-by-side
- **两种显示模式** — 下方显示或并排显示
- **Auto-Translate** — Optionally translate dynamic content (SPA, infinite scroll)
- **自动翻译** — 可选翻译动态内容（SPA、无限滚动）
- **Translation Cache** — Avoids re-translating the same text
- **翻译缓存** — 避免重复翻译相同文本
- **Batch Processing** — Multiple paragraphs per API call for efficiency
- **批量处理** — 一次 API 调用处理多个段落，高效省费
- **Dark Mode** — Automatic OS-level dark mode support
- **暗黑模式** — 自动跟随系统暗黑模式
- **Secure Storage** — chrome.storage.local for API keys
- **安全存储** — 使用 chrome.storage.local 存储 API Key
- **Manifest V3** — Modern Chrome extension architecture
- **Manifest V3** — 现代 Chrome 扩展架构

---

## Installation
## 安装

### Prerequisites
### 前提条件

1. Google Chrome or any Chromium-based browser (Edge, Brave, Arc)
2. A DeepSeek API key ([get one here](https://platform.deepseek.com/api_keys))

1. Google Chrome 或任何基于 Chromium 的浏览器（Edge、Brave、Arc）
2. 一个 DeepSeek API Key（[在此获取](https://platform.deepseek.com/api_keys)）

### Load the Extension
### 加载扩展

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `DeepSeek-Immersive-Translator` folder
6. The extension icon will appear in your toolbar

1. 克隆或下载本仓库
2. 打开 Chrome，访问 `chrome://extensions`
3. 启用 **开发者模式**（右上角开关）
4. 点击 **加载已解压的扩展程序**
5. 选择 `DeepSeek-Immersive-Translator` 文件夹
6. 扩展图标将出现在工具栏中

### Configure Your API Key
### 配置 API Key

1. Click the extension icon in the toolbar
2. Paste your DeepSeek API key (`sk-...`)
3. Click **Save Key**
4. The status indicator will turn green if the key is valid

1. 点击工具栏中的扩展图标
2. 粘贴你的 DeepSeek API Key（`sk-...`）
3. 点击 **保存 Key**
4. Key 有效时状态指示灯将变为绿色

### Start Translating
### 开始翻译

1. Navigate to any webpage
2. Click the extension icon
3. Select your target language
4. Click **Translate Current Page**

1. 打开任意网页
2. 点击扩展图标
3. 选择目标语言
4. 点击 **翻译当前页面**

---

## API Key Security
## API Key 安全性

This extension implements a **zero-leak architecture** for API key handling:

本扩展实现了 **零泄露架构** 来保护 API Key：

| Layer 层级 | Mechanism 机制 |
|-------|-----------|
| **Storage** 存储 | `chrome.storage.local` — encrypted at rest by Chrome / Chrome 静态加密 |
| **Access** 访问 | Only `background.js` can read the key / 仅 background.js 可读取 Key |
| **Transmission** 传输 | Only to `https://api.deepseek.com` over HTTPS / 仅通过 HTTPS 发送至 api.deepseek.com |
| **Isolation** 隔离 | Content scripts NEVER access the key — they send messages to the background worker / 内容脚本绝不直接访问 Key — 通过消息传递给后台 |
| **UI** 界面 | Key input field is masked; saved key is obfuscated in popup / Key 输入框被掩码；已保存的 Key 在弹窗中被混淆显示 |

### What You Should Know
### 你需要了解

- The API key is stored in your browser's local profile
- API Key 存储在浏览器的本地配置文件中
- It is **never** embedded in the extension source code
- 它 **从未** 嵌入扩展源代码中
- If you uninstall the extension, the key is deleted
- 卸载扩展后 Key 即被删除
- You can clear your key at any time from the popup
- 可随时在弹窗中清除 Key

### GitHub Publishing Notes
### GitHub 发布说明

This repository is safe for public GitHub:

本仓库可以安全地公开发布到 GitHub：

- `.gitignore` blocks all credential files
- `.gitignore` 阻止所有凭据文件
- No `.env` files are committed
- 无 `.env` 文件提交
- Source code contains zero API keys, tokens, or secrets
- 源代码中不含任何 API Key、Token 或密钥

---

## Architecture
## 架构

```
popup.html ──────── User interaction (API key input, controls)
                    用户交互（API Key 输入、控制面板）
    │
    │ chrome.runtime.sendMessage
    ▼
background.js ──── Service Worker (API calls, key management)
                   后台服务（API 调用、Key 管理）
    │                    ▲
    │ sendMessage        │ response
    ▼                    │
content.js ─────────────┘
    │
    ├── lib/storage.js     — chrome.storage.local wrapper / 存储封装
    ├── lib/utils.js       — General helpers (debounce, retry, detection) / 通用工具
    ├── lib/dom-handler.js — Safe DOM injection, MutationObserver / 安全 DOM 注入
    └── lib/translator.js  — Translation orchestration, batch/cache / 翻译调度
```

### Key Design Decisions
### 关键设计决策

1. **Service Worker as API Gateway** — All API calls go through `background.js` to avoid CORS and keep the key centralized
1. **Service Worker 作为 API 网关** — 所有 API 调用通过 background.js，避免 CORS 并集中管理 Key
2. **Message-Based Communication** — Content scripts never hold the API key; they request translations via `chrome.runtime.sendMessage`
2. **基于消息的通信** — 内容脚本不持有 API Key；通过 chrome.runtime.sendMessage 请求翻译
3. **Content Script Isolation** — Each page gets injected scripts; they run in the page's context but can't access extension storage directly
3. **内容脚本隔离** — 每个页面注入的脚本运行在页面上下文中，但不能直接访问扩展存储

---

## Tech Stack
## 技术栈

| Component 组件 | Technology 技术 |
|-----------|-----------|
| Extension Framework 扩展框架 | Chrome Manifest V3 |
| Language 语言 | Vanilla JavaScript (no frameworks) 原生 JavaScript（无框架） |
| Styling 样式 | CSS3 with dark mode support / CSS3 + 暗黑模式 |
| Storage 存储 | chrome.storage.local |
| API | DeepSeek Chat API (OpenAI-compatible) |
| Build 构建 | None — runs directly as unpacked extension / 无构建 — 直接作为未打包扩展运行 |

---

## File Structure
## 文件结构

```
DeepSeek-Immersive-Translator/
├── manifest.json          # Extension manifest (V3) / 扩展清单
├── background.js          # Service worker — API calls, key management / API 调用与 Key 管理
├── content.js             # Content script — page integration / 页面集成
├── popup.html             # Extension popup UI / 弹窗界面
├── popup.css              # Popup styles / 弹窗样式
├── popup.js               # Popup logic / 弹窗逻辑
├── lib/
│   ├── storage.js         # chrome.storage.local wrapper / 存储封装
│   ├── utils.js           # Helper utilities / 工具函数
│   ├── dom-handler.js     # Safe DOM injection / 安全 DOM 注入
│   ├── translator.js      # Translation engine / 翻译引擎
│   └── content.css        # Translation block styles / 翻译块样式
├── icons/                 # Extension icons (PNG) / 扩展图标
├── docs/
│   └── architecture.md    # Detailed architecture documentation / 详细架构文档
├── README.md
├── LICENSE
└── .gitignore
```

---

## Supported Languages
## 支持的语言

| Code | Language |
|------|----------|
| `zh-CN` | 中文（简体） |
| `zh-TW` | 中文（繁體） |
| `en` | English |
| `ja` | 日本語 |
| `ko` | 한국어 |
| `fr` | Français |
| `de` | Deutsch |
| `es` | Español |
| `pt` | Português |
| `ru` | Русский |
| `ar` | العربية |
| `vi` | Tiếng Việt |
| `th` | ไทย |

---

## Roadmap
## 路线图

- [x] Bilingual paragraph injection / 双语段落注入
- [x] DeepSeek API integration / DeepSeek API 集成
- [x] Translation cache / 翻译缓存
- [x] Batch processing / 批量处理
- [x] Dark mode / 暗黑模式
- [x] Auto-translate for dynamic content / 动态内容自动翻译
- [ ] Word-level hover translation / 滑词翻译
- [ ] Custom translation prompts / 自定义翻译提示
- [ ] PDF page translation / PDF 页面翻译
- [ ] Firefox extension support / Firefox 扩展支持
- [ ] Offline translation glossary / 离线翻译词汇表

---

## Contributing
## 贡献

Contributions are welcome. Please:

欢迎贡献。请遵循以下流程：

1. Fork the repository / Fork 本仓库
2. Create a feature branch / 创建功能分支
3. Make your changes / 进行修改
4. Submit a Pull Request / 提交 Pull Request

---

## Security
## 安全

If you discover a security vulnerability, please **do not** open a public issue. Instead, email the details privately.

如果你发现安全漏洞，请 **不要** 公开发布 Issue，而是通过邮件私下发送详细信息。

---

## License
## 许可证

MIT License — see [LICENSE](LICENSE) for details.

MIT 许可证 — 详见 [LICENSE](LICENSE)。

---

## Disclaimer
## 免责声明

This extension is not affiliated with DeepSeek. You are responsible for your own API usage and associated costs. This software is provided as-is without warranty.

本扩展与 DeepSeek 无关。你需要自行承担 API 用量及相关费用。本软件按原样提供，不提供任何保证。
