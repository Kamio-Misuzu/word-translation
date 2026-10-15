(() => {
  if (window.__selTranslateLoaded) return;
  window.__selTranslateLoaded = true;

  const settings = { trigger: 'icon' };
  let host = null;
  let root = null;
  let iconEl = null;
  let cardEl = null;
  let reqId = 0;
  let lastPos = { x: 0, y: 0 };

  try {
    chrome.storage.sync.get({ trigger: 'icon' }, (s) => Object.assign(settings, s));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.trigger) settings.trigger = changes.trigger.newValue;
    });
  } catch (e) {
    /* 扩展刚更新,旧页面的上下文已失效,刷新页面即可 */
  }

  const SVG = {
    translate:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    speak:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
  };

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; }
    svg { display: block; }
    .icon {
      position: absolute; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%;
      background: #0f6cbd; color: #fff; display: flex; align-items: center; justify-content: center;
      cursor: pointer; box-shadow: 0 2px 8px rgba(0, 0, 0, .3); transition: transform .12s;
    }
    .icon:hover { transform: scale(1.12); }
    .icon svg { width: 16px; height: 16px; }
    .card {
      position: absolute; background: #fff; color: #1f2328; border: 1px solid #d0d7de; border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, .22); font-size: 14px; line-height: 1.6; overflow: hidden;
    }
    .head, .foot { display: flex; align-items: center; gap: 2px; font-size: 12px; color: #57606a; }
    .head { padding: 5px 6px 5px 12px; background: #f6f8fa; border-bottom: 1px solid #d0d7de; }
    .foot { padding: 4px 6px 6px 12px; border-top: 1px solid #eaeef2; }
    .grow { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .btn {
      width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent;
      color: inherit; cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .btn:hover { background: rgba(128, 128, 128, .2); }
    .btn svg { width: 15px; height: 15px; }
    .btn[hidden] { display: none; }
    .body {
      padding: 10px 12px; max-height: 280px; overflow: auto; white-space: pre-wrap;
      word-break: break-word; user-select: text; font-size: 14px;
    }
    .body.loading { color: #57606a; }
    .body.error { color: #cf222e; }
    @media (prefers-color-scheme: dark) {
      .card { background: #1f2328; color: #e6edf3; border-color: #3d444d; }
      .head { background: #2a3038; border-color: #3d444d; color: #9198a1; }
      .foot { border-color: #30363d; color: #9198a1; }
      .body.loading { color: #9198a1; }
      .body.error { color: #ff7b72; }
    }
  `;

  // 用 DOMParser 构建节点,避开页面 Trusted Types / innerHTML 限制
  function build(markup) {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    return document.importNode(doc.body.firstElementChild, true);
  }

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.style.cssText =
      'all:initial;position:absolute;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;';
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    document.documentElement.appendChild(host);
  }

  function hide() {
    reqId++;
    if (iconEl) iconEl.remove();
    if (cardEl) cardEl.remove();
    iconEl = cardEl = null;
    try {
      speechSynthesis.cancel();
    } catch (e) {}
  }

  function inHost(e) {
    return host && e.composedPath().includes(host);
  }

  function langName(code) {
    if (!code) return '未知';
    if (/^zh(-cn|-hans)?$/i.test(code)) return '简体中文';
    if (/^zh-(tw|hk|hant)$/i.test(code)) return '繁体中文';
    try {
      return new Intl.DisplayNames(['zh-CN'], { type: 'language' }).of(code) || code;
    } catch (e) {
      return code;
    }
  }

  function getSelectedText() {
    const el = document.activeElement;
    if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|tel|email)?$/i.test(el.type)))) {
      try {
        const s = el.value.slice(el.selectionStart, el.selectionEnd).trim();
        if (s) return s;
      } catch (e) {}
    }
    const sel = window.getSelection();
    return sel ? sel.toString().trim() : '';
  }

  function selectionAnchor() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width || rect.height) return { x: rect.left + scrollX, y: rect.bottom + scrollY - 14 };
    }
    return lastPos;
  }

  function request(text) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'translate', text }, (res) => {
          if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
          else resolve(res || { error: '没有收到翻译结果' });
        });
      } catch (e) {
        resolve({ error: '扩展已更新,请刷新当前页面后重试' });
      }
    });
  }

  function speak(text, lang) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (lang) u.lang = lang;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      root.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function showIcon(x, y, text) {
    hide();
    ensureHost();
    iconEl = build(`<button class="icon" title="翻译">${SVG.translate}</button>`);
    iconEl.style.left = x + 4 + 'px';
    iconEl.style.top = y + 12 + 'px';
    iconEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    iconEl.addEventListener('click', (e) => {
      e.preventDefault();
      showCard(x, y, text);
    });
    root.appendChild(iconEl);
  }

  function placeCard(x, y) {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = Math.min(360, vw - 16);
    cardEl.style.width = w + 'px';
    const left = Math.min(Math.max(x, scrollX + 8), scrollX + vw - w - 8);
    let top = y + 14;
    cardEl.style.left = left + 'px';
    cardEl.style.top = top + 'px';
    const h = cardEl.offsetHeight;
    if (top + h > scrollY + vh - 8) {
      const above = y - h - 14;
      top = above >= scrollY + 8 ? above : Math.max(scrollY + 8, scrollY + vh - h - 8);
      cardEl.style.top = top + 'px';
    }
  }

  async function showCard(x, y, text) {
    hide();
    ensureHost();
    const id = ++reqId;

    cardEl = build(`
      <div class="card">
        <div class="head">
          <span class="grow langs">翻译中…</span>
          <button class="btn" data-act="speak-src" title="朗读原文" hidden>${SVG.speak}</button>
          <button class="btn" data-act="close" title="关闭 (Esc)">${SVG.close}</button>
        </div>
        <div class="body loading">翻译中…</div>
        <div class="foot">
          <span class="grow info"></span>
          <button class="btn" data-act="speak-dst" title="朗读译文" hidden>${SVG.speak}</button>
          <button class="btn" data-act="copy" title="复制译文" hidden>${SVG.copy}</button>
        </div>
      </div>`);
    root.appendChild(cardEl);
    placeCard(x, y);

    const card = cardEl;
    const q = (sel) => card.querySelector(sel);
    let result = null;

    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'close') hide();
      else if (act === 'speak-src' && result) speak(text, result.from);
      else if (act === 'speak-dst' && result) speak(result.text, result.to);
      else if (act === 'copy' && result) copyText(result.text);
    });

    const res = await request(text);
    if (id !== reqId) return; // 期间用户已选了别的文字或关闭了面板

    const body = q('.body');
    body.classList.remove('loading');
    if (res.error) {
      body.classList.add('error');
      body.textContent = '翻译失败:' + res.error;
      q('.langs').textContent = '出错了';
    } else {
      result = res;
      body.textContent = res.text;
      q('.langs').textContent = `${langName(res.from)} → ${langName(res.to)}`;
      q('.info').textContent = res.engine + (res.truncated ? ' · 文本过长,仅翻译前 5000 字' : '');
      card.querySelectorAll('[hidden]').forEach((b) => b.removeAttribute('hidden'));
    }
    placeCard(x, y);
  }

  // ---- 事件 ----

  document.addEventListener(
    'mousedown',
    (e) => {
      if (!inHost(e)) hide();
    },
    true
  );

  document.addEventListener(
    'mouseup',
    (e) => {
      if (e.button !== 0 || inHost(e)) return;
      const x = e.pageX;
      const y = e.pageY;
      lastPos = { x, y };
      if (settings.trigger === 'off') return;
      setTimeout(() => {
        const text = getSelectedText();
        if (!text || !/\p{L}/u.test(text)) return;
        if (settings.trigger === 'auto') showCard(x, y, text);
        else showIcon(x, y, text);
      }, 10);
    },
    true
  );

  document.addEventListener(
    'contextmenu',
    (e) => {
      lastPos = { x: e.pageX, y: e.pageY };
    },
    true
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') hide();
    },
    true
  );

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'show-translation') return;
      if (msg.text) {
        showCard(lastPos.x, lastPos.y, msg.text);
      } else {
        const text = getSelectedText();
        if (!text) return;
        const a = selectionAnchor();
        showCard(a.x, a.y, text);
      }
    });
  } catch (e) {}
})();
