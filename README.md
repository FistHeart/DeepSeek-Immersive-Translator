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

## Translation Modes
## 翻译模式

The extension provides four independent translation modes. Enable/disable each from the popup panel.

本扩展提供四种独立的翻译模式，可在弹窗面板中分别开关。

### 1. 正文翻译 (Article Translation)

Automatically detects article paragraphs and inserts translations below each paragraph. Ideal for long-form reading — news, blogs, documentation.

自动检测文章段落并在每段下方插入译文。适合长文阅读 — 新闻、博客、技术文档。

- RED circle → paragraph detected, translation collapsed / 红色圆圈 → 段落已检测，译文已折叠
- GREEN circle → translation visible, click to collapse / 绿色圆圈 → 译文可见，点击折叠
- Batch processing for API efficiency / 批量 API 调用，节能高效
- Viewport-aware lazy translation / 视口感知懒加载翻译

### 2. 短语翻译 (Phrase Translation)

Detects short English phrases (2–10 words) outside article paragraphs — UI labels, technical terms, captions. Non-intrusive YELLOW square indicator.

检测文章段落之外的短英文短语（2–10 词）— UI 标签、技术术语、图注。以不打扰的黄色方形标记。

- YELLOW square → phrase detected, click to translate / 黄色方块 → 已检测，点击翻译
- GREEN square → translation expanded, click to collapse / 绿色方块 → 译文展开，点击折叠
- Translation cache preserved across collapse/expand / 折叠后缓存保留，再次点击秒开
- Refresh button in translation box with timeout recovery / 翻译框内置刷新按钮，支持超时恢复

### 3. 滑动翻译 (Hover Translation)

Hover over any paragraph to see a translation popup. Best for quick lookups without committing to full-page translation.

鼠标悬停在任意段落上即可弹出翻译浮窗。适合快速查阅，无需整页翻译。

- Shadow DOM isolated popup / Shadow DOM 隔离弹窗
- Auto-positioning near cursor / 跟随光标自动定位
- Cache-first: instant display for previously translated text / 缓存优先：已译文本即时显示

### 4. 滑词翻译 (Selection Translation)

Select any text on the page to translate. Works with phrases, sentences, and short paragraphs.

选中页面上任意文字即可翻译。支持短语、句子、短段落。

- 3–4000 character range / 3–4000 字符范围
- Copy button to copy translation / 复制按钮一键复制译文
- Refresh button for retranslation / 重译按钮刷新翻译

---

## Installation
## 安装

### Prerequisites
### 前提条件

- Google Chrome or any Chromium-based browser (Edge, Brave, Arc)
- Google Chrome 或任何基于 Chromium 的浏览器（Edge、Brave、Arc）
- A DeepSeek API key — [get one here](https://platform.deepseek.com/api_keys)
- 一个 DeepSeek API Key — [在此获取](https://platform.deepseek.com/api_keys)

---

### Method 1 — Load Unpacked Extension (Developer)
### 方法一 — 加载未打包扩展（开发者）

Best for development and trying the latest code.

适合开发和体验最新代码。

1. Clone this repository
   ```bash
   git clone https://github.com/FistHeart/DeepSeek-Immersive-Translator.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
   打开 Chrome，访问 `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
   启用 **开发者模式**（右上角开关）
4. Click **Load unpacked** / 点击 **加载已解压的扩展程序**
5. Select the `DeepSeek-Immersive-Translator` folder
   选择 `DeepSeek-Immersive-Translator` 文件夹
6. The extension icon appears in your toolbar
   扩展图标将出现在工具栏中

---

### Method 2 — Install from ZIP Release
### 方法二 — ZIP 发布包安装

Best for users who want a stable release without git.

适合不需要 git 的普通用户。

1. Download the latest `DeepSeek-Immersive-Translator-vX.Y.Z.zip` from [GitHub Releases](https://github.com/FistHeart/DeepSeek-Immersive-Translator/releases)
   从 [GitHub Releases](https://github.com/FistHeart/DeepSeek-Immersive-Translator/releases) 下载最新 ZIP
2. Extract the ZIP file to a folder
   解压 ZIP 到本地文件夹
3. Open Chrome → `chrome://extensions/` → enable **Developer mode**
   打开 Chrome → `chrome://extensions/` → 启用 **开发者模式**
4. Click **Load unpacked** and select the extracted folder
   点击 **加载已解压的扩展程序** 并选择解压后的文件夹

---

### Method 3 — Install CRX Package (Drag & Drop)
### 方法三 — CRX 包安装（拖拽）

Best for local testing and distribution.

适合本地测试和分发。

1. Download the latest `DeepSeek-Immersive-Translator-vX.Y.Z.crx` from [GitHub Releases](https://github.com/FistHeart/DeepSeek-Immersive-Translator/releases)
   从 [GitHub Releases](https://github.com/FistHeart/DeepSeek-Immersive-Translator/releases) 下载最新 CRX
2. Open Chrome → `chrome://extensions/`
   打开 Chrome → `chrome://extensions/`
3. Drag the `.crx` file into the extensions page
   将 `.crx` 文件拖入扩展管理页面
4. Click **Add extension** to confirm
   点击 **添加扩展程序** 确认安装

---

### API Key Configuration
### 配置 API Key

After installation, configure your DeepSeek API key:

安装后配置 DeepSeek API Key：

1. Click the extension icon <img src="icons/icon16.png" width="16" height="16"> in the Chrome toolbar
   点击 Chrome 工具栏中的扩展图标
2. Paste your DeepSeek API key (starts with `sk-...`)
   粘贴你的 DeepSeek API Key（以 `sk-` 开头）
3. Click **Save Key** / 点击 **保存 Key**
4. The status dot turns green — ready to use
   状态指示灯变绿 — 配置完成

**Security**: Your API key is stored ONLY in your browser's local storage (`chrome.storage.local`). It is NEVER sent to any server except `api.deepseek.com` over HTTPS. No developer server, no telemetry, no third-party logging.

**安全性**: API Key 仅存储在你浏览器的本地存储（chrome.storage.local）中。除通过 HTTPS 发送至 api.deepseek.com 外，绝不传输至任何其他服务器。无开发者服务器、无遥测、无第三方日志。

---

## Build
## 构建

The project includes a build pipeline that generates distributable release packages.

项目包含构建流水线，可生成可分发的发布包。

```bash
# Install dependencies (none required for build — Node.js built-ins only)
# 安装依赖（构建仅使用 Node.js 内置模块，无需额外依赖）

# Full build: ZIP + CRX
npm run build

# ZIP only (for Chrome Web Store upload)
npm run build:zip

# CRX only (for local installation)
npm run build:crx

# Validate manifest.json only
npm run prebuild
```

### Build Requirements
### 构建要求

- **Node.js** ≥ 16 (built-in modules only, no npm dependencies)
- **Node.js** ≥ 16（仅使用内置模块，无额外 npm 依赖）
- **Git** — for ZIP generation via `git archive` (clean, .gitignore-aware export)
- **Git** — 用于通过 git archive 生成 ZIP（干净、遵循 .gitignore 的导出）
- **Google Chrome** — for CRX generation via `--pack-extension`
- **Google Chrome** — 用于通过 --pack-extension 生成 CRX

### Release Output
### 发布产物

```
dist/
├── DeepSeek-Immersive-Translator-v5.5.0.zip     ←  Chrome Web Store uploadable
└── DeepSeek-Immersive-Translator-v5.5.0.crx     ←  local drag-and-drop install
```

The version number is automatically read from `manifest.json`. The build script:

版本号自动从 manifest.json 读取。构建脚本：

1. Validates `manifest.json` (required fields, MV3, semver)
   验证 manifest.json（必填字段、MV3、语义版本号）
2. Creates clean dist/ output directory
   创建干净的 dist/ 输出目录
3. Generates ZIP via `git archive` — excludes `.git`, `.DS_Store`, IDE files, logs, temp files
   通过 git archive 生成 ZIP — 排除 .git、.DS_Store、IDE 文件、日志、临时文件
4. Generates CRX via Chrome `--pack-extension` — first run creates `key.pem`; reuse for consistent extension ID
   通过 Chrome --pack-extension 生成 CRX — 首次运行创建 key.pem；复用保持一致的扩展 ID

### First-Time CRX Build
### 首次 CRX 构建

On the first `npm run build`, Chrome will generate a `key.pem` private key in the project root. **Keep this file** — it determines your extension's unique ID. Add it to `.gitignore` (already configured). Without it, each CRX build produces a different extension ID.

首次 `npm run build` 时，Chrome 会在项目根目录生成 `key.pem` 私钥文件。**请保留此文件** — 它决定了扩展的唯一 ID。已配置 .gitignore 忽略该文件。没有它，每次 CRX 构建会生成不同的扩展 ID。

---

## Project Structure
## 项目结构

```
DeepSeek-Immersive-Translator/
├── manifest.json              # Extension manifest (MV3) / 扩展清单
├── background.js              # Service worker — API gateway / API 网关
├── content.js                 # Content script entry — mode dispatch / 内容脚本入口
├── popup.html                 # Extension popup UI / 弹窗界面
├── popup.css                  # Popup styles / 弹窗样式
├── popup.js                   # Popup logic — toggles, API key / 弹窗逻辑
├── lib/
│   ├── utils.js               # Helpers (debounce, retry, isContentArea)
│   ├── storage.js             # chrome.storage.local wrapper
│   ├── dom-handler.js         # Safe DOM injection, page-ready detection
│   ├── readability-engine.js  # Content-area scoring & detection
│   ├── content-classifier.js  # Text → ignore/phrase/paragraph classifier
│   ├── translation-cache.js   # In-memory + chrome.storage cache
│   ├── translation-queue.js   # Batch translation queue
│   ├── translator.js          # Translation engine (single + batch)
│   ├── dom-scanner.js         # Site-adapter paragraph scanner
│   ├── viewport-manager.js    # Viewport-aware content observation
│   ├── popup-position-engine.js # Popup position calculation
│   ├── paragraph-indexer.js   # Paragraph indexing for batch ops
│   ├── paragraph-state-manager.js # RED/GREEN indicator state machine
│   ├── translation-watchdog.js # Stuck-translation recovery
│   ├── hover-popup.js         # 滑动翻译 — hover translation
│   ├── article-translator.js  # 正文翻译 — article translation
│   ├── selection-translator.js # 滑词翻译 — selection translation
│   ├── phrase/                # 短语翻译模块 / Phrase Translation Module
│   │   ├── phrase-cache-manager.js  # Dedicated LRU cache
│   │   ├── phrase-detector.js       # 2-10 word phrase detection
│   │   ├── phrase-renderer.js       # YELLOW/GREEN indicator + translation box
│   │   ├── phrase-translator.js     # Translation with cancellation + timeout
│   │   ├── phrase-lifecycle.js      # State machine + click handler
│   │   ├── phrase-module.js         # Module entry point + observer
│   │   └── phrase.css               # Phrase-specific styles
│   ├── adapters/               # Site-specific adapters
│   │   ├── generic.js
│   │   ├── reddit.js
│   │   ├── twitter.js
│   │   ├── medium.js
│   │   └── arxiv.js
│   └── content.css             # Article + paragraph indicator styles
├── icons/                      # Extension icons (16/48/128)
├── scripts/
│   └── build.js                # Release build pipeline
├── package.json                # NPM scripts (build, build:zip, build:crx)
├── README.md
├── LICENSE
└── .gitignore
```

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

- `.gitignore` blocks all credential files / `.gitignore` 阻止所有凭据文件
- No `.env` files are committed / 无 `.env` 文件提交
- Source code contains zero API keys, tokens, or secrets / 源代码中不含任何 API Key、Token 或密钥

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
    ├── HoverPopup         — 滑动翻译 (hover)
    ├── ArticleTranslator  — 正文翻译 (article)
    ├── PhraseModule       — 短语翻译 (phrase)
    └── SelectionTranslator — 滑词翻译 (selection)
```

### Key Design Decisions
### 关键设计决策

1. **Service Worker as API Gateway** — All API calls go through `background.js` to avoid CORS and keep the key centralized
1. **Service Worker 作为 API 网关** — 所有 API 调用通过 background.js，避免 CORS 并集中管理 Key
2. **Message-Based Communication** — Content scripts never hold the API key; they request translations via `chrome.runtime.sendMessage`
2. **基于消息的通信** — 内容脚本不持有 API Key；通过 chrome.runtime.sendMessage 请求翻译
3. **Content Script Isolation** — Each page gets injected scripts; they run in the page's context but can't access extension storage directly
3. **内容脚本隔离** — 每个页面注入的脚本运行在页面上下文中，但不能直接访问扩展存储
4. **Four Independent Modes** — Each translation mode is a fully isolated module with its own state, CSS namespace, and lifecycle
4. **四种独立模式** — 每种翻译模式为完全隔离的模块，拥有独立的状态、CSS 命名空间和生命周期

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
| Build 构建 | Node.js scripts — ZIP via git archive, CRX via Chrome |

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
- [x] Phrase translation mode / 短语翻译模式
- [x] Release build pipeline / 发布构建流水线
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
