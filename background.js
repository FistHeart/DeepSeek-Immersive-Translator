/**
 * Background Service Worker — DeepSeek V4 Flash API gateway.
 *
 * v6.3 — Language-aware prompts for consistent translation quality across
 * zh-CN/zh-TW/en/ja/ko/fr. Each target language gets a tuned system prompt
 * to prevent cross-language leakage, grammar artifacts, and mixed-script output.
 */
importScripts('lib/storage.js');
const API = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-chat';
const TO = 15000;

// ── Language-specific system prompts ───────────────
//
//  Each prompt enforces:
//    - Output ONLY the translation
//    - Natural target-language phrasing
//    - No explanations, no markdown, no bilingual output
//    - Preserve meaning, tone, and formatting

const PROMPTS = {
  'zh-CN': 'You are a professional translator. Translate the following text into Simplified Chinese (简体中文). Output ONLY the translation. Use natural Chinese phrasing. Do not add explanations, notes, or original text.',
  'zh-TW': 'You are a professional translator. Translate the following text into Traditional Chinese (繁體中文). Output ONLY the translation. Use natural Taiwanese Mandarin phrasing. Do not add explanations, notes, or original text.',
  'en':    'You are a professional translator. Translate the following text into English. Output ONLY the translation. Use natural English phrasing. Do not add explanations, notes, or original text.',
  'ja':    'You are a professional translator. Translate the following text into natural Japanese (日本語). Output ONLY the translation. Use natural Japanese grammar and phrasing — NOT Chinese-style Japanese. Use appropriate です/ます or だ/である tone consistently. Do not add explanations, notes, or original text.',
  'ko':    'You are a professional translator. Translate the following text into natural Korean (한국어). Output ONLY the translation. Use natural Korean grammar with appropriate speech level. Do not add explanations, notes, or original text.',
  'fr':    'You are a professional translator. Translate the following text into natural French (Français). Output ONLY the translation. Use natural French grammar, correct accents, and appropriate register. Do not add explanations, notes, or original text.',
};

// Fallback for any unsupported language code
const DEFAULT_PROMPT = 'You are a professional translator. Output ONLY the translation. No explanations. Preserve meaning, tone, and formatting.';

const BATCH_PROMPT = 'Translate each numbered paragraph into the target language. Output ONLY a JSON array of strings in order. No other text. No explanations.';

// ── Route: single translation ──────────────────────

chrome.runtime.onMessage.addListener((m, s, r) => {
  const handler = { translate: one, translateBatch: many, validateKey: val }[m.action];
  if (handler) { handler(m).then(r).catch(e => r({ error: e.message })); return true; }
});

async function one({ text, targetLang }) {
  if (!text || typeof text !== 'string') throw Error('Invalid input');

  const k = await Storage.getApiKey();
  if (!k) throw Error('API key not set');

  const sysPrompt = PROMPTS[targetLang] || DEFAULT_PROMPT;
  console.log('[DTI] Translate request: lang=' + targetLang + ' chars=' + text.length);

  const x = await call(k, [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: text }
  ]);

  const result = (x.choices?.[0]?.message?.content || '').trim();
  console.log('[DTI] Translation response: lang=' + targetLang + ' resultLen=' + result.length);
  return { translation: result };
}

// ── Route: batch translation ───────────────────────

async function many({ texts, targetLang }) {
  if (!texts?.length) throw Error('Invalid input');

  const k = await Storage.getApiKey();
  if (!k) throw Error('API key not set');

  const sysPrompt = PROMPTS[targetLang] || DEFAULT_PROMPT;
  const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n');

  console.log('[DTI] Batch translate: lang=' + targetLang + ' count=' + texts.length);

  const x = await call(k, [
    { role: 'system', content: sysPrompt + '\n\n' + BATCH_PROMPT },
    { role: 'user', content: numbered }
  ]);

  const raw = (x.choices?.[0]?.message?.content || '[]').trim();
  let arr;
  try {
    arr = JSON.parse(raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim());
  } catch {
    arr = [raw];
  }
  while (arr.length < texts.length) arr.push('');
  return { translations: arr.slice(0, texts.length) };
}

// ── Route: validate API key ────────────────────────

async function val() {
  const k = await Storage.getApiKey();
  if (!k) return { valid: false, error: 'No key' };
  try {
    const x = await call(k, [
      { role: 'system', content: 'Say OK' },
      { role: 'user', content: '.' }
    ], { max_tokens: 3 });
    return { valid: !!x.choices?.[0]?.message?.content };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// ── HTTP call with timeout ─────────────────────────

async function call(k, m, o = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TO);
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${k}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: m,
        temperature: o.temperature || 0.2,
        max_tokens: o.max_tokens || 2048,
        stream: false
      }),
      signal: ctrl.signal
    });
    if (!r.ok) {
      const errors = {
        401: 'Invalid key', 402: 'Insufficient balance',
        429: 'Rate limited', 500: 'Server error',
        502: 'Server error', 503: 'Server error'
      };
      throw Error(errors[r.status] || 'API ' + r.status);
    }
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw Error('Timeout');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

chrome.runtime.onInstalled.addListener(() => console.log('[DTI] Service Worker installed — V4 Flash, 6-language support'));
