[English](./README.md) | [简体中文](./README.zh-CN.md)

# DeepSeek Immersive Translator

<p align="center">
  <img src="https://img.shields.io/badge/chrome-extension-4285F4?style=flat-square" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/manifest-v3-blue?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/ai-deepseek-4f46e5?style=flat-square" alt="DeepSeek">
</p>

<p align="center">
  <strong>Immersive bilingual webpage translation right inside Chrome — powered by DeepSeek.</strong>
</p>

---

## Introduction

DeepSeek Immersive Translator is a Chrome Extension that inserts translated text directly beneath original webpage content, paragraph by paragraph, without breaking the page layout. It uses the DeepSeek Chat API for high-quality translations and runs entirely in your browser — no backend, no telemetry, no third-party servers.

Four independent translation modes cover every reading scenario: long-form articles, quick hover lookups, short UI phrases, and selected text.

---

## Features

| Category | Detail |
|----------|--------|
| **Bilingual Display** | Translations appear directly below original text — no tab switching |
| **4 Translation Modes** | Article, Phrase, Hover, and Selection — each independently toggleable |
| **13 Languages** | Chinese, Japanese, Korean, French, German, Spanish, Portuguese, Russian, Arabic, Vietnamese, Thai, and more |
| **Paragraph Detection** | Intelligently identifies content, skips navigation, ads, and code blocks |
| **Layout Preserving** | Non-invasive DOM injection compatible with React, Vue, and static sites |
| **Auto-Translate** | Optional automatic translation for dynamically loaded content (SPA, infinite scroll) |
| **Translation Cache** | In-memory + persistent cache avoids re-translating the same text |
| **Batch Processing** | Multiple paragraphs per API call for cost efficiency |
| **Dark Mode** | Automatic OS-level dark mode that respects site theme overrides |
| **Privacy First** | API key stored locally in `chrome.storage.local` — never leaves your browser |
| **Manifest V3** | Modern Chrome extension architecture with service worker backend |

---

## Screenshots

> *Screenshots coming soon. Contributions welcome!*

---

## Installation

### Prerequisites

- **Google Chrome** or any Chromium-based browser (Edge, Brave, Arc)
- **A DeepSeek API key** — [Get one at platform.deepseek.com](https://platform.deepseek.com/api_keys)

### Method 1 — Load Unpacked (from Source)

Best for developers and early adopters.

```bash
git clone https://github.com/FistHeart/DeepSeek-Immersive-Translator.git
```

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the cloned `DeepSeek-Immersive-Translator` folder
5. The extension icon will appear in your toolbar

### Method 2 — Install from ZIP Release

Best for users who want a stable release without using git.

1. Download the latest `DeepSeek-Immersive-Translator-vX.Y.Z.zip` from [GitHub Releases](https://github.com/FistHeart/DeepSeek-Immersive-Translator/releases)
2. Extract the ZIP file to a local folder
3. Open Chrome → `chrome://extensions/` → Enable **Developer mode**
4. Click **Load unpacked** and select the extracted folder

### Method 3 — Install CRX Package (Drag & Drop)

Best for quick local installation.

1. Download the latest `DeepSeek-Immersive-Translator-vX.Y.Z.crx` from [GitHub Releases](https://github.com/FistHeart/DeepSeek-Immersive-Translator/releases)
2. Open Chrome → `chrome://extensions/`
3. Drag the `.crx` file into the extensions page
4. Click **Add extension** to confirm

---

## Usage

1. Click the extension icon <img src="icons/icon16.png" width="16" height="16" style="vertical-align:middle"> in your Chrome toolbar
2. In the popup panel, toggle the translation modes you want:
   - **Article Translation** — full-page paragraph translation
   - **Phrase Translation** — short phrase detection & translation
   - **Hover Translation** — mouse-hover popup translation
   - **Selection Translation** — translate selected text
3. Select your target language from the dropdown
4. Navigate to any webpage — translation begins automatically based on your enabled modes

---

## DeepSeek API Key Setup

This extension uses **your own** DeepSeek API key. No proxy, no shared quota.

### Get a Key

1. Visit [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
2. Sign up or log in
3. Create a new API key (starts with `sk-...`)
4. Copy the key

### Configure in Extension

1. Click the extension icon in the toolbar
2. Paste your API key into the input field
3. Click **Save Key**
4. The status indicator turns green when the key is valid

### Key Storage

- Your API key is stored **only** in `chrome.storage.local` (encrypted at rest by Chrome)
- It is **never** sent anywhere except `https://api.deepseek.com` over HTTPS
- Content scripts never access the key directly — all API calls go through the background service worker
- Uninstalling the extension permanently deletes the key

---

## Translation Modes

### 1. Article Translation

Detects article paragraphs and inserts translations beneath each one. Ideal for news, blogs, documentation, and any long-form content.

- **Activation**: Toggle "正文翻译" in the popup
- **Behavior**: RED circle marker appears on detected paragraphs → auto-translates in batches → GREEN circle when complete
- **Interaction**: Click RED to trigger translation, click GREEN to collapse, click again to restore (cached)
- **Performance**: Batch API calls, IntersectionObserver-based viewport-aware lazy loading, watchdog recovery for stuck translations

### 2. Phrase Translation

Detects short English phrases (2–10 words) **outside** article paragraphs — UI labels, technical terms, captions, card text.

- **Activation**: Toggle "短语翻译" in the popup
- **Behavior**: YELLOW square appears near detected phrases → click to translate → GREEN square when done
- **Interaction**: Click YELLOW to expand translation (cached or new), click GREEN to collapse (cache preserved), refresh button in translation box for re-translation with timeout recovery
- **Isolation**: Fully isolated module — never overlaps with Article Translator territory (`[data-ds-art]` elements)

### 3. Hover Translation

Hover over any paragraph to see an instant translation popup. Best for quick lookups without enabling full-page translation.

- **Activation**: Toggle "滑动翻译" in the popup
- **Behavior**: Mouse over a paragraph for 250ms → Shadow DOM popup appears near cursor
- **Interaction**: Auto-positions near cursor, auto-hides when cursor leaves, refresh button for re-translation
- **Performance**: Cache-first strategy — previously translated text appears instantly

### 4. Selection Translation

Select any text on the page to translate. Works with phrases, sentences, and paragraphs (3–4000 characters).

- **Activation**: Toggle "滑词翻译" in the popup
- **Behavior**: Select text → popup appears near selection
- **Interaction**: Copy button (copies translation), refresh button (re-translates), click outside to dismiss
- **Performance**: Cache-first for repeated selections

---

## Project Structure

```
DeepSeek-Immersive-Translator/
├── manifest.json                  # Extension manifest (Manifest V3)
├── background.js                  # Service worker — API gateway, key management
├── content.js                     # Content script entry — mode dispatch
├── popup.html / popup.css / popup.js  # Extension popup UI
├── lib/
│   ├── utils.js                   # Helpers: debounce, retry, isContentArea
│   ├── storage.js                 # chrome.storage.local wrapper
│   ├── dom-handler.js             # Safe DOM injection, page-ready detection
│   ├── readability-engine.js      # Content-area scoring & detection
│   ├── content-classifier.js      # Text classifier: ignore / phrase / paragraph
│   ├── translation-cache.js       # Two-layer cache (memory + chrome.storage)
│   ├── translation-queue.js       # Batch translation queue
│   ├── translator.js              # Translation engine (single + batch)
│   ├── dom-scanner.js             # Site-adapter paragraph scanner
│   ├── viewport-manager.js        # Viewport-aware content observation
│   ├── popup-position-engine.js   # Popup position calculation
│   ├── paragraph-indexer.js       # Paragraph indexing for batch operations
│   ├── paragraph-state-manager.js # RED/GREEN indicator state machine
│   ├── translation-watchdog.js    # Stuck-translation recovery
│   ├── hover-popup.js             # Hover translation mode
│   ├── article-translator.js      # Article translation mode
│   ├── selection-translator.js    # Selection translation mode
│   ├── phrase/                    # Phrase translation module (7 files)
│   │   ├── phrase-cache-manager.js    # Dedicated LRU cache
│   │   ├── phrase-detector.js         # 2–10 word phrase detection
│   │   ├── phrase-renderer.js         # YELLOW/GREEN indicator + translation box
│   │   ├── phrase-translator.js       # Translation with cancellation & timeout
│   │   ├── phrase-lifecycle.js        # State machine & click handler
│   │   ├── phrase-module.js           # Module entry point & observer
│   │   └── phrase.css                 # Phrase-specific styles
│   ├── adapters/                  # Site-specific content adapters
│   │   ├── generic.js / reddit.js / twitter.js / medium.js / arxiv.js
│   └── content.css                # Article & paragraph indicator styles
├── icons/                         # Extension icons (16 / 48 / 128 px)
├── scripts/
│   └── build.js                   # Release build pipeline
├── package.json                   # NPM scripts
├── README.md                      # English documentation (this file)
├── README.zh-CN.md                # Chinese documentation
├── LICENSE
└── .gitignore
```

---

## Build

The project includes a zero-dependency build pipeline that generates distributable release packages.

```bash
# Full build: ZIP + CRX
npm run build

# ZIP only (for Chrome Web Store upload)
npm run build:zip

# CRX only (for local drag-and-drop installation)
npm run build:crx

# Validate manifest.json only
npm run prebuild
```

### Requirements

- **Node.js** ≥ 16 (built-in modules only — zero npm dependencies)
- **Git** — for clean ZIP generation via `git archive`
- **Google Chrome** — for CRX generation via `--pack-extension`

---

## Release Packaging

The build script reads the version from `manifest.json` and outputs:

```
dist/
├── DeepSeek-Immersive-Translator-v5.5.0.zip   ← Chrome Web Store uploadable
└── DeepSeek-Immersive-Translator-v5.5.0.crx   ← Local drag-and-drop installable
```

**ZIP** is generated via `git archive`, automatically excluding development files (`.git`, `.DS_Store`, IDE configs, logs, temp files). `manifest.json` sits at the ZIP root — ready for Chrome Web Store upload.

**CRX** is generated via Chrome's native `--pack-extension`. The first build creates a `key.pem` private key in the project root — save this file for consistent extension IDs across builds (already in `.gitignore`).

---

## Privacy & Security

This extension implements a **zero-leak architecture**:

| Layer | Mechanism |
|-------|-----------|
| **Storage** | `chrome.storage.local` — encrypted at rest by Chrome |
| **Access** | Only `background.js` (service worker) can read the API key |
| **Transmission** | API key sent exclusively to `https://api.deepseek.com` over HTTPS |
| **Isolation** | Content scripts never access the key — they request translations via `chrome.runtime.sendMessage` |
| **UI** | Key input is masked; saved keys are obfuscated in the popup |

- No analytics, no trackers, no developer backend
- API key stored exclusively in your browser profile
- Uninstalling the extension permanently deletes the key
- Source code contains zero credentials — safe for public GitHub

---

## Supported Languages

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

- [x] Bilingual paragraph injection
- [x] DeepSeek API integration
- [x] Translation cache (in-memory + persistent)
- [x] Batch translation processing
- [x] Dark mode (OS-level + site class detection)
- [x] Auto-translate for dynamic content (SPA, infinite scroll)
- [x] Phrase translation mode (2–10 word detection, YELLOW/GREEN indicators)
- [x] Release build pipeline (ZIP + CRX)
- [ ] Screenshots & demo GIFs
- [ ] Custom translation prompts
- [ ] PDF page translation
- [ ] Firefox extension support
- [ ] Offline translation glossary

---

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Submit a Pull Request

For bugs or feature requests, please [open an issue](https://github.com/FistHeart/DeepSeek-Immersive-Translator/issues).

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

## Disclaimer

This extension is not affiliated with DeepSeek. You are responsible for your own API usage and associated costs. This software is provided as-is without warranty.
