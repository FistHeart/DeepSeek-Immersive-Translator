# Architecture Documentation

## Communication Flow

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│                                                         │
│  ┌──────────┐    sendMessage    ┌──────────────────┐   │
│  │  popup.js │ ──────────────── │  background.js   │   │
│  │           │                   │  (Service Worker) │   │
│  │  • API key│                   │                  │   │
│  │  • Lang   │                   │  • Holds API key │   │
│  │  • Prefs  │                   │  • API calls     │   │
│  └──────────┘                   │  • Key validation│   │
│       │                         └────────┬─────────┘   │
│       │ storage                          │             │
│       ▼                                 │ sendMessage │
│  ┌──────────┐                           ▼             │
│  │ chrome.  │                   ┌──────────────────┐   │
│  │ storage  │                   │   content.js     │   │
│  │ .local   │                   │                  │   │
│  │          │                   │  • DOM injection │   │
│  │  • apiKey│                   │  • Translation   │   │
│  │  • prefs │                   │  • Observer      │   │
│  │  • cache │                   │                  │   │
│  └──────────┘                   └──────────────────┘   │
│                                        │               │
│                                        │ DOM           │
│                                        ▼               │
│                                  ┌──────────┐          │
│                                  │ Webpage  │          │
│                                  └──────────┘          │
└─────────────────────────────────────────────────────────┘
```

## Security Model

### API Key Isolation

1. User enters API key in `popup.html`
2. `popup.js` saves it to `chrome.storage.local`
3. Only `background.js` (service worker) reads the key
4. Content scripts (`content.js`, `lib/translator.js`) request translations via `chrome.runtime.sendMessage`
5. Content scripts NEVER have access to the API key

### Data Flow

- **popup → storage**: Save API key and preferences
- **popup → content**: Trigger translation, set preferences
- **content → background**: Request translation (text + target language only)
- **background → DeepSeek API**: HTTP POST with API key in Authorization header
- **background → content**: Return translated text
- **content → DOM**: Inject translation block

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| API key in source code | Key only in chrome.storage.local, never in files |
| XSS accessing key | Content scripts don't have key access |
| MITM on API calls | HTTPS enforced, fetch from service worker |
| Malicious webpage | Content script runs isolated; no key access |
| Extension inspection | chrome.storage.local encrypted at rest |

## Translation Pipeline

```
User clicks "Translate"
        │
        ▼
Extract paragraphs (utils.js)
        │
        ├─ Skip nav, footer, ads
        ├─ Skip code blocks
        ├─ Skip already translated
        └─ Keep content paragraphs
        │
        ▼
Batch texts (translator.js)
        │
        ├─ Check cache → return if cached
        ├─ Group uncached texts into batches of 3
        └─ Send batches to background.js
        │
        ▼
API call (background.js)
        │
        ├─ System prompt for translation quality
        ├─ DeepSeek Chat API
        └─ Parse response
        │
        ▼
Cache results (storage.js)
        │
        ▼
Inject translations (dom-handler.js)
        │
        ├─ Wrap original text
        ├─ Insert translation block below
        └─ Apply styling
```

## Storage Schema

```javascript
chrome.storage.local = {
  apiKey: "sk-...",              // User's DeepSeek API key
  preferences: {
    enabled: true,               // Auto-translate toggle
    targetLang: "zh-CN",         // Target language code
    translationStyle: "below",   // "below" | "side"
    maxParagraphLength: 5000,    // Max chars per paragraph
    batchSize: 3,                // Paragraphs per API call
    cacheTTL: 86400000,          // Cache lifetime (ms)
    preserveFormatting: true,    // Keep original formatting
    showOriginalFirst: true,     // Original above translation
  },
  translationCache: {
    "<hash>": {
      translation: "...",
      timestamp: 1717000000000,
      textLength: 250
    }
    // ... up to 500 entries
  }
}
```
