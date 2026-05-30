/** Background Service Worker — DeepSeek V4 Flash API gateway. Minimized prompts for speed. */
importScripts('lib/storage.js');
const API='https://api.deepseek.com/chat/completions', MODEL='deepseek-chat', TO=15000;

// Ultra-compact prompts for minimal token overhead
const S = 'You are a translator. Output ONLY the translation. No explanations. Preserve meaning, tone, formatting. Keep technical terms unchanged.';
const B = 'Translate each numbered paragraph. Output ONLY a JSON array of strings. No other text.';

chrome.runtime.onMessage.addListener((m,s,r)=>{const h={translate:one,batch:many,validateKey:val}[m.action];if(h){h(m).then(r).catch(e=>r({error:e.message}));return !0}});

async function one({text,targetLang}){if(!text||typeof text!=='string')throw Error('Invalid');const k=await Storage.getApiKey();if(!k)throw Error('API key not set');const x=await call(k,[{role:'system',content:S},{role:'user',content:`To ${targetLang}: ${text}`}]);return{translation:(x.choices?.[0]?.message?.content||'').trim()}}

async function many({texts,targetLang}){if(!texts?.length)throw Error('Invalid');const k=await Storage.getApiKey();if(!k)throw Error('API key not set');const b=texts.map((t,i)=>`[${i+1}]${t}`).join('\n');const x=await call(k,[{role:'system',content:B},{role:'user',content:`To ${targetLang}:\n${b}`}]);const raw=(x.choices?.[0]?.message?.content||'[]').trim();let a;try{a=JSON.parse(raw.replace(/```(?:json)?\n?/g,'').replace(/```/g,'').trim())}catch{a=[raw]}while(a.length<texts.length)a.push('');return{translations:a.slice(0,texts.length)}}

async function val(){const k=await Storage.getApiKey();if(!k)return{valid:!1,error:'No key'};try{const x=await call(k,[{role:'system',content:'Say OK'},{role:'user',content:'.'}],{max_tokens:3});return{valid:!!x.choices?.[0]?.message?.content}}catch(e){return{valid:!1,error:e.message}}}

async function call(k,m,o={}){const c=new AbortController(),t=setTimeout(()=>c.abort(),TO);try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${k}`},body:JSON.stringify({model:MODEL,messages:m,temperature:o.temperature||0.2,max_tokens:o.max_tokens||2048,stream:!1}),signal:c.signal});if(!r.ok){const e={401:'Invalid key',402:'Insufficient balance',429:'Rate limited',500:'Server error',502:'Server error',503:'Server error'};throw Error(e[r.status]||`API ${r.status}`)}return await r.json()}catch(e){if(e.name==='AbortError')throw Error('Timeout');throw e}finally{clearTimeout(t)}}

chrome.runtime.onInstalled.addListener(()=>console.log('DTI v3 installed — V4 Flash'));
