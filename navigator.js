/* Chat outline and prompt navigation. */
(() => {
  'use strict';
  const API = '__codexChatNavigator';
  const HOST_ID = 'codex-chat-navigator';
  const previous = globalThis[API];
  if (previous && !previous.destroyed) {
    if (previous.snapshot().appearance?.activeColor !== undefined) {
      previous.setAppearance(globalThis.__codexEnhancementsConfig?.appearance);
      return previous.refresh();
    }
    previous.destroy();
  }
  if (!document.body) return { applied: false, mode: 'waiting', items: 0 };

  const strings = {
    zh: {
      rail: '聊天提问目录', title: '提问目录', searchHint: '搜索本次聊天的提问', search: '搜索提问',
      empty: '没有匹配的提问', limited: '仅显示当前已加载的提问',
      count: total => `${total} 条`, prompt: number => `第 ${number} 次提问`,
      entry: (number, label) => `第 ${number} 次提问：${label}`, hover: '悬停加载', attachment: '图片或附件',
      unmounted: '当前提问已不在页面中，请稍后重试', retry: '请重试',
      jumpError: detail => `暂时无法定位：${detail}`
    },
    en: {
      rail: 'Chat prompt navigation', title: 'Prompts', searchHint: 'Search prompts in this chat', search: 'Search prompts',
      empty: 'No matching prompts', limited: 'Showing loaded prompts only',
      count: total => `${total} ${total === 1 ? 'prompt' : 'prompts'}`, prompt: number => `Prompt ${number}`,
      entry: (number, label) => `Prompt ${number}: ${label}`, hover: 'Hover to load', attachment: 'Image or attachment',
      unmounted: 'This prompt is no longer on the page. Try again shortly.', retry: 'Try again',
      jumpError: detail => `Could not jump to the prompt: ${detail}`
    }
  };
  let appearance = { language: 'zh', color: null, activeColor: null, opacity: 97 };
  let appearanceRgb = null;
  let copy = strings.zh;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-codex-chat-navigator', 'true');
  host.style.cssText = 'position:fixed;z-index:90;display:none;width:34px;transform:translateY(-50%);pointer-events:auto;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;--nav-theme-rgb:250 250 250;--nav-border:#24364c29;--nav-text:#253143;--nav-muted:#58677b;--nav-node:#64768b;--nav-default-active:#08775d;--nav-hover:#3a5c8410;color-scheme:light}
    :host([data-theme=dark]){--nav-theme-rgb:35 35 37;--nav-border:#b6ceeb2b;--nav-text:#e2e8f1;--nav-muted:#aebad0;--nav-node:#8292a8;--nav-default-active:#63e6be;--nav-hover:#c7d9f518;color-scheme:dark}
    *,*::before,*::after{box-sizing:border-box}
    .shell{--nav-active:var(--nav-user-active,var(--nav-default-active));position:absolute;right:0;top:0;transform:translateY(-50%);width:34px;border:1px solid transparent;border-radius:18px;padding:9px 4px;overflow:hidden;color:var(--nav-text);font:14px/1.5 'Segoe UI','Microsoft YaHei UI',sans-serif;transition:width .23s cubic-bezier(.22,.72,.28,1),background-color .18s ease,border-color .18s ease}
    .shell[data-expanded=true]{width:var(--open-width,340px);padding:12px;background:rgb(var(--nav-panel-rgb,var(--nav-theme-rgb)) / var(--nav-panel-alpha,.97));border-color:var(--nav-border);box-shadow:0 14px 38px #0b142632;backdrop-filter:blur(var(--nav-panel-blur,12px))}
    .shell[data-expanded=true][data-panel-tone=light]{--nav-border:#0003;--nav-text:#141b25;--nav-muted:#323e50;--nav-node:#0008;--nav-default-active:#08634c;--nav-hover:#0001;color-scheme:light}
    .shell[data-expanded=true][data-panel-tone=dark]{--nav-border:#fff4;--nav-text:#f3f6fc;--nav-muted:#cfd8e6;--nav-node:#fff8;--nav-default-active:#83f1cd;--nav-hover:#fff2;color-scheme:dark}
    .header{display:none;gap:8px;align-items:center;padding:0 2px 9px;white-space:nowrap}
    .shell[data-expanded=true] .header{display:flex;animation:arrive .22s .05s both}
    .title{font-size:14px;font-weight:650;user-select:none;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .count{font-size:11px;color:var(--nav-muted);margin-left:auto;flex:0 0 auto;font-variant-numeric:tabular-nums}
    .search-wrap{display:none;padding:0 0 9px}
    .shell[data-expanded=true][data-search=true] .search-wrap{display:block}
    .search{width:100%;height:31px;outline:none;border:1px solid var(--nav-border);border-radius:9px;background:var(--nav-hover);color:var(--nav-text);font:12px 'Segoe UI','Microsoft YaHei UI',sans-serif;padding:5px 9px}
    .search::placeholder{color:var(--nav-muted)}
    .search:focus{border-color:var(--nav-default-active)}
    .list{overflow-y:auto;overflow-x:hidden;max-height:var(--list-height,60vh);overscroll-behavior:contain;scrollbar-width:none;padding:2px 0;outline:none}
    .shell[data-expanded=true] .list{scrollbar-width:thin;scrollbar-color:var(--nav-node) transparent}
    .entry{appearance:none;position:relative;display:flex;width:100%;height:26px;align-items:center;justify-content:center;padding:0;border:0;border-radius:8px;background:transparent;color:var(--nav-text);cursor:pointer;font:inherit;text-align:left;outline:none}
    .shell[data-expanded=false] .entry::before{content:'';position:absolute;inset:0 auto 0 50%;width:1px;background:var(--nav-border)}
    .shell[data-expanded=false] .entry:first-child::before{top:50%}
    .shell[data-expanded=false] .entry:last-child::before{bottom:50%}
    .node{position:relative;width:7px;height:7px;flex:none;border-radius:2px;background:var(--nav-node);transform:rotate(45deg);transition:transform .2s cubic-bezier(.2,.8,.2,1),background-color .16s,box-shadow .16s}
    .entry[aria-current=true] .node{background:var(--nav-active);transform:rotate(45deg) scale(1.35);box-shadow:0 0 0 3px color-mix(in srgb,var(--nav-active) 24%,transparent)}
    .entry:focus-visible{box-shadow:inset 0 0 0 1px var(--nav-default-active)}
    .order,.entry-label{display:none}
    .shell[data-expanded=true] .entry{height:35px;justify-content:flex-start;gap:9px;padding:0 10px 0 6px;transition:background-color .16s;animation:arrive .22s .045s both}
    .shell[data-expanded=true] .node{display:none}
    .shell[data-expanded=true] .order{display:grid;place-items:center;flex:0 0 34px;height:23px;border-radius:6px;background:var(--nav-hover);color:var(--nav-muted);font-size:11px;font-variant-numeric:tabular-nums}
    .shell[data-expanded=true] .entry-label{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;unicode-bidi:plaintext}
    .shell[data-expanded=true] .entry:hover{background:var(--nav-hover)}
    .shell[data-expanded=true] .entry[aria-current=true]{background:color-mix(in srgb,var(--nav-active) 15%,transparent);font-weight:600}
    .shell[data-expanded=true] .entry[aria-current=true] .order{box-shadow:inset 2px 0 var(--nav-active);background:color-mix(in srgb,var(--nav-active) 19%,transparent);color:var(--nav-text)}
    .entry[data-loading=true] :is(.node,.order){animation:pulse .8s ease-in-out infinite}
    .empty{display:none;font-size:12px;text-align:center;padding:12px 7px;color:var(--nav-muted)}
    .shell[data-expanded=true] .empty[data-visible=true]{display:block}
    .status{font-size:11px;line-height:1.5;display:none;padding:7px 5px 0 1px;color:var(--nav-muted);white-space:normal}
    .shell[data-expanded=true] .status[data-visible=true]{display:block}
    @keyframes arrive{from{opacity:0;transform:translateX(9px)}to{opacity:1;transform:translateX(0)}}
    @keyframes pulse{50%{opacity:.35}}
    @media(prefers-reduced-motion:reduce){.shell,.shell *{transition:none!important;animation:none!important}}
  `;
  const shell = document.createElement('nav');
  shell.className = 'shell';
  shell.dataset.expanded = 'false';
  const header = document.createElement('div');
  header.className = 'header';
  const title = document.createElement('span');
  title.className = 'title';
  const count = document.createElement('span');
  count.className = 'count';
  header.append(title, count);
  const searchWrap = document.createElement('div');
  searchWrap.className = 'search-wrap';
  const search = document.createElement('input');
  search.className = 'search';
  search.type = 'search';
  searchWrap.append(search);
  const list = document.createElement('div');
  list.className = 'list';
  const empty = document.createElement('div');
  empty.className = 'empty';
  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('role', 'status');
  shell.append(header, searchWrap, list, empty, status);
  shadow.append(style, shell);
  document.body.append(host);

  let destroyed = false;
  let expanded = false;
  let settingsOpen = false;
  let mode = 'waiting';
  let conversationKey = '';
  let activeId = '';
  let items = [];
  let activeRoot = null;
  let scrollElement = null;
  let providerFiber = null;
  let provider = null;
  let fingerprint = '';
  let error = '';
  let statusKey = '';
  let statusDetail = '';
  let query = '';
  let pendingRefresh = 0;
  let pendingSpy = 0;
  let closeTimer = 0;
  let jumpSerial = 0;
  let localRootId = 0;
  const rootKeys = new WeakMap();
  const labelCache = new Map();
  const previewPending = new Set();
  const timers = new Set();
  const nodeById = new Map();
  const listeners = [];

  function localize() {
    host.lang = appearance.language === 'en' ? 'en' : 'zh-CN';
    shell.setAttribute('aria-label', copy.rail);
    title.textContent = copy.title;
    search.placeholder = copy.searchHint;
    search.setAttribute('aria-label', copy.search);
    empty.textContent = copy.empty;
    paintStatus();
  }
  function updatePanelTone() {
    if (!appearanceRgb || appearance.opacity === 0) {
      delete shell.dataset.panelTone;
      return;
    }
    const base = host.dataset.theme === 'dark' ? [35, 35, 37] : [250, 250, 250];
    const alpha = appearance.opacity / 100;
    const linear = appearanceRgb.map((channel, index) => {
      const mixed = (channel * alpha + base[index] * (1 - alpha)) / 255;
      return mixed <= .04045 ? mixed / 12.92 : ((mixed + .055) / 1.055) ** 2.4;
    });
    const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    shell.dataset.panelTone = luminance > .179 ? 'light' : 'dark';
  }
  function setAppearance(value) {
    if (destroyed) return snapshot();
    const hex = color => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : null;
    const next = {
      language: value?.language === 'en' ? 'en' : 'zh',
      color: hex(value?.color),
      activeColor: hex(value?.activeColor),
      opacity: Number.isInteger(value?.opacity) && value.opacity >= 0 && value.opacity <= 100 ? value.opacity : 97
    };
    const languageChanged = !host.lang || next.language !== appearance.language;
    const backgroundChanged = next.color !== appearance.color || next.opacity !== appearance.opacity;
    if (next.activeColor !== appearance.activeColor) {
      if (next.activeColor) shell.style.setProperty('--nav-user-active', next.activeColor);
      else shell.style.removeProperty('--nav-user-active');
    }
    appearance = next;
    if (backgroundChanged) {
      appearanceRgb = next.color?.slice(1).match(/../g).map(channel => Number.parseInt(channel, 16)) || null;
      if (appearanceRgb) shell.style.setProperty('--nav-panel-rgb', appearanceRgb.join(' '));
      else shell.style.removeProperty('--nav-panel-rgb');
      shell.style.setProperty('--nav-panel-alpha', String(next.opacity / 100));
      shell.style.setProperty('--nav-panel-blur', next.opacity ? '12px' : '0px');
      updatePanelTone();
    }
    if (languageChanged) {
      copy = strings[next.language];
      localize();
      for (const item of items) item.label = plainLabel(item.raw, item.index);
      render();
    }
    return snapshot();
  }
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function delay(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
    timers.add(id);
    return id;
  }
  function visible(e) {
    if (!e || !e.isConnected || !e.getClientRects().length || e.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    const rect = e.getBoundingClientRect();
    const css = getComputedStyle(e);
    return rect.width > 100 && rect.height > 20 && css.visibility !== 'hidden' && css.display !== 'none';
  }
  function activeTranscript() {
    const scrolls = [...document.querySelectorAll('.thread-scroll-container,[data-app-action-timeline-scroll]')].filter(visible);
    scrolls.sort((a, b) => {
      const mainA = a.getAttribute('data-pip-anchor-host') === 'codex-main-thread';
      const mainB = b.getAttribute('data-pip-anchor-host') === 'codex-main-thread';
      if (mainA !== mainB) return mainA ? -1 : 1;
      return b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight;
    });
    const scroll = scrolls[0];
    if (!scroll) return null;
    const root = scroll.querySelector('[data-thread-find-target="conversation"]') ||
      scroll.querySelector('[data-thread-user-message-navigation-content]') || scroll;
    return { scroll, root };
  }
  function fiberOf(element) {
    const key = Object.keys(element).find(k => k.startsWith('__reactFiber$'));
    return key ? currentFiber(element[key]) : null;
  }
  function currentFiber(fiber) {
    if (!fiber) return null;
    let top = fiber;
    let guard = 0;
    while (top.return && guard++ < 250) top = top.return;
    const current = top.stateNode && top.stateNode.current;
    return current && current !== top ? (fiber.alternate || null) : fiber;
  }
  function providerProps(fiber) {
    const p = currentFiber(fiber)?.memoizedProps;
    return p && typeof p.getItems === 'function' && typeof p.onRevealItem === 'function' ? p : null;
  }
  function findProvider(root) {
    if (providerFiber) {
      const fresh = providerProps(providerFiber);
      if (fresh) return { fiber: currentFiber(providerFiber), props: fresh };
    }
    const first = fiberOf(root);
    if (first) {
      const queue = [{ fiber: first.child, depth: 0 }];
      let seen = 0;
      let fallback = null;
      while (queue.length && seen++ < 1600) {
        const next = queue.shift();
        const f = next.fiber;
        if (!f || next.depth > 18) continue;
        const props = providerProps(f);
        if (props) {
          const result = { fiber: currentFiber(f), props };
          if (props.bookmarkKey != null) return result;
          fallback ||= result;
        }
        if (f.sibling) queue.push({ fiber: f.sibling, depth: next.depth });
        if (f.child) queue.push({ fiber: f.child, depth: next.depth + 1 });
      }
      if (fallback) return fallback;
    }
    // The native rail is a portal. Its rendered list can provide an upward path
    // when the transcript's initial render has not exposed its wrapper yet.
    const layout = root.closest('[data-request-input-activity-root]') || root.parentElement?.parentElement;
    const rail = layout?.querySelector('[data-thread-user-message-navigation-rail-list]');
    let f = rail && fiberOf(rail);
    for (let i = 0; f && i < 35; i++, f = f.return) {
      const props = providerProps(f);
      if (props) return { fiber: currentFiber(f), props };
      const p = currentFiber(f)?.memoizedProps;
      if (p && Array.isArray(p.items) && typeof p.onRevealItem === 'function') {
        return { fiber: null, props: { ...p, getItems: () => p.items } };
      }
    }
    return null;
  }
  function anchor(id) {
    if (!activeRoot) return null;
    return [...activeRoot.querySelectorAll('[data-content-search-unit-key]')].find(e => e.getAttribute('data-content-search-unit-key') === id) || null;
  }
  function anchorsById() {
    const result = new Map();
    for (const node of activeRoot?.querySelectorAll('[data-content-search-unit-key]') || []) {
      const id = node.getAttribute('data-content-search-unit-key');
      if (id && !result.has(id)) result.set(id, node);
    }
    return result;
  }
  function revealedAnchor(item) {
    const exact = anchor(item.id) || item.raw.element;
    if (exact) return exact;
    if (item.raw.isLoaded !== false || !item.raw.turnKey || !activeRoot) return null;
    const turn = [...activeRoot.querySelectorAll('[data-content-search-turn-key]')]
      .find(node => node.getAttribute('data-content-search-turn-key') === item.raw.turnKey);
    return turn?.querySelector('[data-local-conversation-user-anchor][data-content-search-unit-key],[data-content-search-unit-key]:has([data-user-message-bubble])') || null;
  }
  function plainLabel(raw, index) {
    let value = '';
    try { if (typeof raw.getLabel === 'function') value = raw.getLabel() || ''; } catch {}
    if (!value && raw.element) {
      const bubble = raw.element.querySelector('[data-user-message-bubble]') || raw.element.querySelector('[data-user-message]');
      value = bubble?.innerText || bubble?.textContent || '';
    }
    value = String(value).replace(/\s+/g, ' ').trim();
    if (value) labelCache.set(raw.id, value);
    return value || labelCache.get(raw.id) || `${copy.prompt(index + 1)} · ${raw.isLoaded === false ? copy.hover : copy.attachment}`;
  }
  function domItems(root) {
    const seen = new Set();
    const candidates = root.querySelectorAll('[data-local-conversation-user-anchor][data-content-search-unit-key],[data-content-search-unit-key]:has([data-user-message-bubble])');
    return [...candidates].filter(e => {
      const id = e.getAttribute('data-content-search-unit-key');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).map(e => ({ id: e.getAttribute('data-content-search-unit-key'), element: e }));
  }
  function snapshot() {
    return { applied: !destroyed, items: items.length, activeId, mode, conversationKey, expanded, query, error, appearance: { ...appearance } };
  }
  function setExpanded(value) {
    if (destroyed || (!value && settingsOpen)) return;
    if (closeTimer) { clearTimeout(closeTimer); timers.delete(closeTimer); closeTimer = 0; }
    if (expanded === value) return;
    expanded = value;
    shell.dataset.expanded = String(value);
    host.style.width = value ? `${Math.min(350, Math.max(200, (scrollElement?.clientWidth || 400) - 36))}px` : '34px';
    updateGeometry();
    if (value) ensureCurrentInList();
  }
  function setSettingsOpen(value) {
    if (destroyed) return;
    settingsOpen = Boolean(value);
    if (settingsOpen) setExpanded(true);
    else if (!shell.matches(':hover') && !shadow.activeElement?.matches(':focus-visible')) setExpanded(false);
  }
  function ensureCurrentInList() {
    const button = nodeById.get(activeId);
    if (!button || button.hidden) return;
    const top = button.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + button.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + button.offsetHeight - list.clientHeight;
  }
  function paintStatus() {
    error = statusKey === 'jumpError' ? copy.jumpError(statusDetail || copy.retry) : copy[statusKey] || '';
    status.textContent = error || (mode === 'dom' ? copy.limited : '');
    status.dataset.visible = String(Boolean(status.textContent));
  }
  function setStatus(key, detail = '') {
    statusKey = key;
    statusDetail = detail;
    paintStatus();
  }
  function updateGeometry() {
    if (!scrollElement || !visible(scrollElement) || !items.length) { host.style.display = 'none'; return; }
    const r = scrollElement.getBoundingClientRect();
    const lower = Math.max(12, r.top + 14);
    const upper = Math.min(innerHeight - 12, r.bottom - 90);
    const available = Math.max(60, upper - lower);
    const h = Math.min(available, innerHeight * .68, 520);
    host.style.display = 'block';
    host.style.right = `${Math.max(6, innerWidth - Math.min(r.right, innerWidth) + 7)}px`;
    host.style.top = `${lower + available / 2}px`;
    shell.style.setProperty('--list-height', `${Math.max(44, h - (expanded ? 75 : 22))}px`);
    shell.style.setProperty('--open-width', `${Math.min(350, Math.max(200, r.width - 36))}px`);
    host.style.width = expanded ? `${Math.min(350, Math.max(200, r.width - 36))}px` : '34px';
    const doc = document.documentElement;
    let dark = doc.classList.contains('dark') || doc.dataset.theme === 'dark' || doc.dataset.colorMode === 'dark';
    if (!dark) {
      let e = scrollElement;
      while (e) {
        const css = getComputedStyle(e);
        const match = css.backgroundColor.match(/^rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?\)/);
        if (match && (match[4] == null || Number(match[4]) > .5)) {
          dark = Number(match[1]) * .2126 + Number(match[2]) * .7152 + Number(match[3]) * .0722 < 128;
          break;
        }
        e = e.parentElement;
      }
    }
    const theme = dark ? 'dark' : 'light';
    if (host.dataset.theme !== theme) {
      host.dataset.theme = theme;
      updatePanelTone();
    }
  }
  function render() {
    const next = items.map(i => `${i.id}\u0000${i.label}`).join('\u0001') + `\u0002${query}\u0002${appearance.language}`;
    if (next === fingerprint) return;
    fingerprint = next;
    const focusId = shadow.activeElement?.dataset.itemId;
    const oldScroll = list.scrollTop;
    list.replaceChildren();
    nodeById.clear();
    const normalized = query.trim().toLocaleLowerCase();
    let matched = 0;
    for (const item of items) {
      if (normalized && !item.label.toLocaleLowerCase().includes(normalized)) continue;
      matched++;
      const button = document.createElement('button');
      button.className = 'entry';
      button.type = 'button';
      button.dataset.itemId = item.id;
      button.setAttribute('aria-label', copy.entry(item.index + 1, item.label));
      button.setAttribute('aria-current', String(item.id === activeId));
      button.title = item.label;
      const label = document.createElement('span');
      label.className = 'entry-label';
      label.textContent = item.label;
      const node = document.createElement('span');
      node.className = 'node';
      node.setAttribute('aria-hidden', 'true');
      const order = document.createElement('span');
      order.className = 'order';
      order.setAttribute('aria-hidden', 'true');
      order.textContent = String(item.index + 1).padStart(2, '0');
      button.append(node, order, label);
      button.addEventListener('click', () => { void jump(item.id); });
      button.addEventListener('pointerenter', () => { void preview(item.id); });
      button.addEventListener('focus', () => { void preview(item.id); });
      nodeById.set(item.id, button);
      list.append(button);
    }
    count.textContent = normalized ? `${matched} / ${items.length}` : copy.count(items.length);
    shell.dataset.search = String(items.length >= 12 || Boolean(query));
    empty.dataset.visible = String(matched === 0);
    list.scrollTop = oldScroll;
    if (focusId && nodeById.has(focusId)) nodeById.get(focusId).focus({ preventScroll: true });
  }
  function spy() {
    if (destroyed || !activeRoot || !scrollElement) return;
    const r = scrollElement.getBoundingClientRect();
    const line = r.top + Math.min(100, r.height * .2);
    const anchors = anchorsById();
    const measured = items.map(item => {
      const e = anchors.get(item.id) || item.raw.element;
      if (!e || !e.isConnected) return null;
      const box = (e.querySelector('[data-user-message-bubble]') || e).getBoundingClientRect();
      return box.height > 0 ? { id: item.id, top: box.top } : null;
    }).filter(Boolean);
    if (measured.length) {
      const before = measured.filter(e => e.top <= line);
      activeId = before.length ? before[before.length - 1].id : measured[0].id;
    } else if (!items.some(i => i.id === activeId)) activeId = items[0]?.id || '';
    for (const [id, node] of nodeById) node.setAttribute('aria-current', String(id === activeId));
    if (!expanded) ensureCurrentInList();
  }
  function scheduleSpy() {
    if (!pendingSpy) pendingSpy = requestAnimationFrame(() => { pendingSpy = 0; spy(); });
  }
  function scheduleRefresh() {
    if (!pendingRefresh) pendingRefresh = delay(() => { pendingRefresh = 0; refresh(); }, 160);
  }
  function refresh() {
    if (destroyed) return snapshot();
    const active = activeTranscript();
    if (!active) {
      mode = 'waiting'; items = []; activeRoot = null; scrollElement = null; providerFiber = null; provider = null;
      host.style.display = 'none';
      return snapshot();
    }
    if (active.root !== activeRoot) {
      activeRoot = active.root;
      providerFiber = null;
      provider = null;
    }
    scrollElement = active.scroll;
    const found = findProvider(activeRoot);
    provider = found?.props || null;
    providerFiber = found?.fiber || null;
    const nativeKey = provider?.bookmarkKey;
    if (!rootKeys.has(activeRoot)) rootKeys.set(activeRoot, ++localRootId);
    const nextKey = nativeKey != null ? String(nativeKey) : `${location.pathname}${location.search}${location.hash}:dom-${rootKeys.get(activeRoot)}`;
    if (nextKey !== conversationKey) {
      conversationKey = nextKey;
      activeId = '';
      query = '';
      search.value = '';
      fingerprint = '';
      labelCache.clear();
      previewPending.clear();
      jumpSerial++;
      list.scrollTop = 0;
      settingsOpen = false;
      setExpanded(false);
    }
    let raw = null;
    try { if (provider) raw = provider.getItems(); } catch {}
    mode = Array.isArray(raw) ? 'native' : 'dom';
    if (!Array.isArray(raw)) raw = domItems(activeRoot);
    const seen = new Set();
    items = raw.filter(item => item && typeof item.id === 'string' && !item.isHeartbeat && !seen.has(item.id) && seen.add(item.id))
      .map((item, index) => ({ id: item.id, raw: item, index, label: plainLabel(item, index) }));
    render();
    setStatus('');
    updateGeometry();
    spy();
    return snapshot();
  }
  async function preview(id) {
    const item = items.find(i => i.id === id);
    if (!item || item.raw.isLoaded !== false || typeof provider?.onPreviewItem !== 'function') return;
    const key = `${conversationKey}:${id}`;
    if (previewPending.has(key)) return;
    previewPending.add(key);
    const previousConversation = conversationKey;
    try { await provider.onPreviewItem(item.raw); } catch {}
    finally {
      previewPending.delete(key);
      if (!destroyed && conversationKey === previousConversation) refresh();
    }
  }
  async function jump(id) {
    if (destroyed) return false;
    refresh();
    const item = items.find(i => i.id === id);
    if (!item) return false;
    const serial = ++jumpSerial;
    const key = conversationKey;
    const button = nodeById.get(id);
    if (button) button.dataset.loading = 'true';
    try {
      if (mode === 'native' && typeof provider?.onRevealItem === 'function') await provider.onRevealItem(item.raw);
      if (destroyed || serial !== jumpSerial || key !== conversationKey) return false;
      const deadline = performance.now() + 1600;
      let target = revealedAnchor(item);
      while (!target && performance.now() < deadline && !destroyed && key === conversationKey && serial === jumpSerial) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        target = revealedAnchor(item);
      }
      if (destroyed || serial !== jumpSerial || key !== conversationKey) return false;
      if (target && target.isConnected) {
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
        activeId = id;
        delay(() => {
          if (key === conversationKey && serial === jumpSerial && target.isConnected) {
            const r = scrollElement?.getBoundingClientRect();
            const t = target.getBoundingClientRect();
            if (r && Math.abs(t.top - r.top) > 50) target.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
            scheduleSpy();
          }
        }, 380);
      } else if (mode !== 'native') {
        setStatus('unmounted');
        return false;
      }
      else activeId = id;
      setStatus('');
      scheduleSpy();
      return true;
    } catch (e) {
      setStatus('jumpError', e?.message);
      return false;
    } finally {
      if (button) delete button.dataset.loading;
    }
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    observer.disconnect();
    clearInterval(interval);
    for (const id of timers) clearTimeout(id);
    timers.clear();
    if (pendingSpy) cancelAnimationFrame(pendingSpy);
    listeners.forEach(remove => remove());
    host.remove();
    provider = null;
    providerFiber = null;
    items = [];
    nodeById.clear();
    labelCache.clear();
    previewPending.clear();
    if (globalThis[API] === api) delete globalThis[API];
  }
  listen(shell, 'pointerenter', () => setExpanded(true));
  listen(shell, 'pointerleave', () => {
    closeTimer = delay(() => {
      if (!shadow.activeElement || !shadow.activeElement.matches(':focus-visible')) setExpanded(false);
    }, 220);
  });
  listen(shell, 'focusin', () => setExpanded(true));
  listen(shell, 'focusout', () => delay(() => { if (!shadow.activeElement && !shell.matches(':hover')) setExpanded(false); }, 100));
  listen(search, 'input', () => { query = search.value; render(); });
  listen(shell, 'keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (query) { query = ''; search.value = ''; render(); }
      shadow.activeElement?.blur();
      setExpanded(false);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || event.target === search) return;
    const entries = [...nodeById.values()];
    if (!entries.length) return;
    const index = entries.indexOf(shadow.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 :
      event.key === 'ArrowUp' ? Math.max(0, index - 1) : Math.min(entries.length - 1, index + 1);
    event.preventDefault(); event.stopPropagation();
    entries[next].focus();
  });
  listen(window, 'scroll', event => { if (event.target !== host) scheduleSpy(); }, true);
  listen(window, 'resize', scheduleRefresh);
  const observer = new MutationObserver(records => {
    if (records.some(r => r.target !== host && !host.contains(r.target))) scheduleRefresh();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
  const interval = setInterval(refresh, 1000);
  const api = { snapshot, refresh, jump, destroy, setAppearance, setSettingsOpen, get destroyed() { return destroyed; } };
  globalThis[API] = api;
  setAppearance(globalThis.__codexEnhancementsConfig?.appearance);
  return refresh();
})()
