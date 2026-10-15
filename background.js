const DEFAULTS = { targetLang: 'zh-CN', engine: 'google', trigger: 'icon' };
const MAX_LEN = 5000;
const MYMEMORY_CHUNK = 450;
const ENGINE_LABEL = { google: 'Google 翻译', mymemory: 'MyMemory' };

const base = (code) => (code || '').toLowerCase().split('-')[0];

// ---- 翻译引擎:返回 { text, from } ----

async function googleTranslate(text, to) {
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: text })
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const out = (data[0] || []).map((seg) => seg[0] || '').join('');
  if (!out) throw new Error('返回为空');
  return { text: out, from: data[2] };
}

function guessLang(text) {
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  if (/[一-鿿]/.test(text)) return 'zh-CN';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  return 'en';
}

// MyMemory 单次请求限 500 字节,按句子切块后依次翻译
function splitChunks(text) {
  const parts = text.match(/[^.!?。！？\n]+[.!?。！？\n]*\s*/g) || [text];
  const chunks = [];
  let cur = '';
  for (const p of parts) {
    if (cur.length + p.length > MYMEMORY_CHUNK) {
      if (cur) chunks.push(cur);
      cur = '';
      if (p.length > MYMEMORY_CHUNK) {
        for (let i = 0; i < p.length; i += MYMEMORY_CHUNK) chunks.push(p.slice(i, i + MYMEMORY_CHUNK));
        continue;
      }
    }
    cur += p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function myMemoryTranslate(text, to) {
  const from = guessLang(text);
  if (base(from) === base(to)) return { text, from };
  const out = [];
  for (const chunk of splitChunks(text.slice(0, 2000))) {
    if (!chunk.trim()) {
      out.push(chunk);
      continue;
    }
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', chunk);
    url.searchParams.set('langpair', `${from}|${to}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.responseStatus !== 200) throw new Error(data.responseDetails || `状态 ${data.responseStatus}`);
    out.push(data.responseData.translatedText);
  }
  return { text: out.join(' ').trim(), from };
}

const ENGINES = { google: googleTranslate, mymemory: myMemoryTranslate };

// ---- 对外入口 ----

async function translate(rawText, toOverride) {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  const trimmed = rawText.trim();
  const text = trimmed.slice(0, MAX_LEN);
  const truncated = trimmed.length > MAX_LEN;
  const target = toOverride || settings.targetLang;
  const order = settings.engine === 'mymemory' ? ['mymemory', 'google'] : ['google', 'mymemory'];
  const errors = [];

  for (const name of order) {
    try {
      let to = target;
      let result = await ENGINES[name](text, to);
      // 原文语言与目标语言相同时,反向翻译(中文→英文,其他→中文)
      if (base(result.from) === base(to)) {
        const alt = base(to) === 'en' ? 'zh-CN' : 'en';
        if (base(result.from) !== base(alt)) {
          to = alt;
          result = await ENGINES[name](text, to);
        }
      }
      return { text: result.text, from: result.from, to, engine: ENGINE_LABEL[name], truncated };
    } catch (err) {
      errors.push(`${ENGINE_LABEL[name]}: ${err.message}`);
    }
  }
  throw new Error(errors.join(';'));
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'translate') {
    translate(msg.text || '', msg.to).then(sendResponse, (err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg && msg.type === 'open-in-viewer') {
    chrome.tabs.update(msg.tabId, { url: viewerUrl(msg.url) }).then(
      () => sendResponse({}),
      (err) => sendResponse({ error: err.message })
    );
    return true;
  }
});

// ---- PDF:Edge 自带阅读器不允许扩展注入脚本,改用内置的 pdf.js 阅读器打开 ----

const VIEWER = chrome.runtime.getURL('pdfjs/web/viewer.html');

function viewerUrl(pdfUrl) {
  const u = new URL(pdfUrl);
  const hash = u.hash;
  u.hash = '';
  return `${VIEWER}?file=${encodeURIComponent(u.href)}${hash}`;
}

function isPdfUrl(url) {
  try {
    const u = new URL(url);
    return /^(https?|file|ftp):$/.test(u.protocol) && /\.pdf$/i.test(u.pathname);
  } catch (e) {
    return false;
  }
}

// PDF 地址会先提交到历史记录再被替换成阅读器。从阅读器点「后退」会回到这个 PDF 地址,
// 此时再后退一步,否则会被反复重定向回阅读器。
chrome.webNavigation.onCommitted.addListener(
  async (details) => {
    if (details.frameId !== 0 || !isPdfUrl(details.url)) return;
    const { pdfViewer } = await chrome.storage.sync.get({ pdfViewer: true });
    if (!pdfViewer) return;
    if (details.transitionQualifiers.includes('forward_back')) {
      chrome.tabs.goBack(details.tabId).catch(() => {});
    } else {
      chrome.tabs.update(details.tabId, { url: viewerUrl(details.url) }).catch(() => {});
    }
  },
  { url: [{ pathSuffix: '.pdf' }, { pathSuffix: '.PDF' }] }
);

// ---- 右键菜单与快捷键 ----

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: '翻译“%s”',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'translate-selection' || !tab || tab.id == null) return;
  chrome.tabs
    .sendMessage(tab.id, { type: 'show-translation', text: info.selectionText }, { frameId: info.frameId || 0 })
    .catch(() => {});
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'translate-selection' || !tab || tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { type: 'show-translation' }).catch(() => {});
});
