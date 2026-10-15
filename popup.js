const DEFAULTS = { targetLang: 'zh-CN', engine: 'google', trigger: 'icon' };

const LANGS = [
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁体中文'],
  ['en', 'English'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['it', 'Italiano'],
  ['ru', 'Русский'],
  ['ar', 'العربية'],
  ['vi', 'Tiếng Việt'],
  ['th', 'ไทย']
];

const $ = (id) => document.getElementById(id);

for (const [code, name] of LANGS) {
  const opt = document.createElement('option');
  opt.value = code;
  opt.textContent = name;
  $('targetLang').appendChild(opt);
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const key of Object.keys(DEFAULTS)) $(key).value = s[key];
});

for (const key of Object.keys(DEFAULTS)) {
  $(key).addEventListener('change', () => chrome.storage.sync.set({ [key]: $(key).value }));
}

chrome.storage.sync.get({ pdfViewer: true }, (s) => {
  $('pdfViewer').checked = s.pdfViewer;
});
$('pdfViewer').addEventListener('change', () => chrome.storage.sync.set({ pdfViewer: $('pdfViewer').checked }));

$('openPdf').addEventListener('click', async () => {
  const status = $('pdfStatus');
  status.hidden = false;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^(https?|file|ftp):/i.test(tab.url || '')) {
    status.textContent = '当前页面不是可以用阅读器打开的网页或文件。';
    return;
  }
  const res = await chrome.runtime.sendMessage({ type: 'open-in-viewer', tabId: tab.id, url: tab.url });
  if (res && res.error) status.textContent = '打开失败:' + res.error;
  else window.close();
});

async function run() {
  const text = $('input').value.trim();
  if (!text) return;
  $('go').disabled = true;
  $('status').textContent = '翻译中…';
  const res = await chrome.runtime.sendMessage({ type: 'translate', text });
  $('go').disabled = false;
  $('status').textContent = '';
  const out = $('result');
  out.hidden = false;
  out.classList.toggle('error', !!res.error);
  out.textContent = res.error ? '翻译失败:' + res.error : res.text;
}

$('go').addEventListener('click', run);
$('input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run();
});
