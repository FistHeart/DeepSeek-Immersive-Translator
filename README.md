# DeepSeek Immersive Translator

<p align="center">
  <img src="https://img.shields.io/badge/chrome-extension-4285F4" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/manifest-v3-blue" alt="Manifest V3">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/ai-deepseek-4f46e5" alt="DeepSeek">
</p>

<p align="center">
  <strong>A Chrome Extension that provides immersive bilingual webpage translation powered by DeepSeek.</strong>
</p>

---

## Overview

DeepSeek Immersive Translator inserts bilingual translations beneath original webpage text — paragraph by paragraph — while preserving the original page layout. It uses the DeepSeek Chat API for high-quality translations and runs entirely in the browser.

### Why This Extension

- **Immersive Reading** — Translations appear directly beneath the original text. No toggling, no new tabs.
- **Privacy First** — Your API key is stored locally in Chrome storage. It is NEVER sent anywhere except to `api.deepseek.com`.
- **Layout Preserving** — Non-invasive DOM injection that respects React, Vue, and static websites.
- **Cost Efficient** — Built-in translation cache, batching, and deduplication minimize API usage.
- **Open Source** — MIT licensed. No trackers, no analytics, no backend.

---

## Features

- **Bilingual Translation** — Original text + translation displayed together
- **Paragraph Detection** — Intelligently identifies content, skips nav/ads/code
- **13 Languages** — Chinese, Japanese, Korean, French, German, Spanish, and more
- **Two Display Modes** — Below-text or side-by-side
- **Auto-Translate** — Optionally translate dynamic content (SPA, infinite scroll)
- **Translation Cache** — Avoids re-translating the same text
- **Batch Processing** — Multiple paragraphs per API call for efficiency
- **Dark Mode** — Automatic OS-level dark mode support
- **Secure Storage** — chrome.storage.local for API keys
- **Manifest V3** — Modern Chrome extension architecture

---

## Installation

### Prerequisites

1. Google Chrome or any Chromium-based browser (Edge, Brave, Arc)
2. A DeepSeek API key ([get one here](https://platform.deepseek.com/api_keys))

### Load the Extension

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked**
5. Select the `DeepSeek-Immersive-Translator` folder
6. The extension icon will appear in your toolbar

### Configure Your API Key

1. Click the extension icon in the toolbar
2. Paste your DeepSeek API key (`sk-...`)
3. Click **Save Key**
4. The status indicator will turn green if the key is valid

### Start Translating

1. Navigate to any webpage
2. Click the extension icon
3. Select your target language
4. Click **Translate Current Page**

---

## API Key Security

This extension implements a **zero-leak architecture** for API key handling:

| Layer | Mechanism |
|-------|-----------|
| **Storage** | `chrome.storage.local` — encrypted at rest by Chrome |
| **Access** | Only `background.js` can read the key |
| **Transmission** | Only to `https://api.deepseek.com` over HTTPS |
| **Isolation** | Content scripts NEVER access the key — they send messages to the background worker |
| **UI** | Key input field is masked; saved key is obfuscated in popup |

### What You Should Know

- The API key is stored in your browser's local profile
- It is **never** embedded in the extension source code
- If you uninstall the extension, the key is deleted
- You can clear your key at any time from the popup

### GitHub Publishing Notes

This repository is safe for public GitHub:
- `.gitignore` blocks all credential files
- No `.env` files are committed
- Source code contains zero API keys, tokens, or secrets

---

## Architecture

```
popup.html ──────── User interaction (API key input, controls)
    │
    │ chrome.runtime.sendMessage
    ▼
background.js ──── Service Worker (API calls, key management)
    │                    ▲
    │ sendMessage        │ response
    ▼                    │
content.js ─────────────┘
    │
    ├── lib/storage.js     — chrome.storage.local wrapper
    ├── lib/utils.js       — General helpers (debounce, retry, detection)
    ├── lib/dom-handler.js — Safe DOM injection, MutationObserver
    └── lib/translator.js  — Translation orchestration, batch/cache
```

### Key Design Decisions

1. **Service Worker as API Gateway** — All API calls go through `background.js` to avoid CORS and keep the key centralized
2. **Message-Based Communication** — Content scripts never hold the API key; they request translations via `chrome.runtime.sendMessage`
3. **Content Script Isolation** — Each page gets injected scripts; they run in the page's context but can't access extension storage directly

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Extension Framework | Chrome Manifest V3 |
| Language | Vanilla JavaScript (no frameworks) |
| Styling | CSS3 with dark mode support |
| Storage | chrome.storage.local |
| API | DeepSeek Chat API (OpenAI-compatible) |
| Build | None — runs directly as unpacked extension |

---

## File Structure

```
DeepSeek-Immersive-Translator/
├── manifest.json          # Extension manifest (V3)
├── background.js          # Service worker — API calls, key management
├── content.js             # Content script — page integration
├── popup.html             # Extension popup UI
├── popup.css              # Popup styles
├── popup.js               # Popup logic
├── lib/
│   ├── storage.js         # chrome.storage.local wrapper
│   ├── utils.js           # Helper utilities
│   ├── dom-handler.js     # Safe DOM injection
│   ├── translator.js      # Translation engine
│   └── content.css        # Translation block styles
├── icons/                 # Extension icons (PNG)
├── docs/
│   └── architecture.md    # Detailed architecture documentation
├── README.md
├── LICENSE
└── .gitignore
```

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
- [x] Translation cache
- [x] Batch processing
- [x] Dark mode
- [x] Auto-translate for dynamic content
- [ ] Word-level hover translation
- [ ] Custom translation prompts
- [ ] PDF page translation
- [ ] Firefox extension support
- [ ] Offline translation glossary

---

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a Pull Request

---

## Security

If you discover a security vulnerability, please **do not** open a public issue. Instead, email the details privately.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Disclaimer

This extension is not affiliated with DeepSeek. You are responsible for your own API usage and associated costs. This software is provided as-is without warranty.
