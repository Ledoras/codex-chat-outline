/* In-client settings for Codex Enhancements. No network or chat persistence. */
(() => {
  'use strict';
  const API = '__codexEnhancements';
  const HOST_ID = 'codex-enhancements-settings';
  const BUTTON_ID = 'codex-enhancements-font-button';
  if (globalThis[API] && !globalThis[API].destroyed) {
    if (globalThis[API].snapshot().appearance?.activeColor !== undefined) return globalThis[API].refresh(globalThis.__codexEnhancementsConfig);
    globalThis[API].destroy();
  }
  if (!document.body) return { font: null, navigation: null, ready: false };

  const defaults = { ui: 14, code: 12, chat: 14 };
  const fontKeys = ['chat', 'ui', 'code'];
  const copy = {
    zh: {
      settings: '设置', open: '打开聊天目录设置', title: '字体与聊天目录', close: '关闭设置',
      language: '语言', appearance: '目录外观', color: '背景颜色', autoColor: '跟随主题', opacity: '背景不透明度',
      activeColor: '当前项颜色', autoActive: '默认颜色',
      fonts: '字号', hint: '字号以 px 为单位，可输入任意正数。', chat: '正文', ui: '界面', code: '代码',
      size: label => `${label}字号`, smaller: label => `缩小${label}字号`, larger: label => `放大${label}字号`,
      apply: '应用并记住', defaults: '默认字号', reset: '恢复正文 14px、界面 14px、代码 12px',
      idle: '点击「应用并记住」保存设置。', changed: '修改后点应用。', invalid: '请输入大于 0 的有限数字，例如 18、64 或 1e4。',
      notReady: '字体组件尚未就绪，请稍后重试。', pending: '已应用，正在保存……', saved: '已保存。',
      disconnected: '当前已应用，但未连接到保存服务。', timeout: '当前已应用，保存尚未确认。',
      failed: '当前已应用，但未能保存。请重试。',
    },
    en: {
      settings: 'Settings', open: 'Open chat outline settings', title: 'Fonts & chat outline', close: 'Close settings',
      language: 'Language', appearance: 'Outline appearance', color: 'Background color', autoColor: 'Use theme color', opacity: 'Background opacity',
      activeColor: 'Current item color', autoActive: 'Use default color',
      fonts: 'Font sizes', hint: 'Enter any positive font size in pixels.', chat: 'Chat', ui: 'Interface', code: 'Code',
      size: label => `${label} font size`, smaller: label => `Decrease ${label.toLowerCase()} font size`, larger: label => `Increase ${label.toLowerCase()} font size`,
      apply: 'Apply and save', defaults: 'Default font sizes', reset: 'Restore chat to 14px, interface to 14px and code to 12px',
      idle: 'Select Apply and save to keep your settings.', changed: 'Select Apply and save when ready.', invalid: 'Enter a finite number greater than 0, such as 18, 64 or 1e4.',
      notReady: 'Font controls are still loading. Try again shortly.', pending: 'Applied. Saving…', saved: 'Saved.',
      disconnected: 'Applied. The save service is disconnected.', timeout: 'Applied. Saving has yet to be confirmed.',
      failed: 'Applied. Saving failed. Try again.',
    },
  };
  const valid = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  function fontFrom(config) {
    const value = config?.font || config;
    return value && fontKeys.every(key => valid(value[key]))
      ? { ui: value.ui, code: value.code, chat: value.chat } : null;
  }
  function appearanceFrom(config) {
    const value = config?.appearance;
    const hex = color => typeof color === 'string' && /^#[\da-f]{6}$/i.test(color) ? color.toLowerCase() : null;
    return {
      language: value?.language === 'en' ? 'en' : 'zh',
      color: hex(value?.color),
      activeColor: hex(value?.activeColor),
      opacity: Number.isInteger(value?.opacity) && value.opacity >= 0 && value.opacity <= 100 ? value.opacity : 97,
    };
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  const host = element('div');
  host.id = HOST_ID;
  host.hidden = true;
  host.style.cssText = 'position:fixed;z-index:120;width:324px;display:none;pointer-events:auto;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = element('style');
  style.textContent = `
    :host{all:initial;--font-panel-bg:#fafafa;--font-panel-ink:#34383d;--font-panel-muted:#707782;--font-panel-border:#dfe1e5;--font-panel-button:#eff1f4;--font-panel-accent:#3679d6;color-scheme:light}
    :host([data-theme=dark]){--font-panel-bg:#252527;--font-panel-ink:#e2e2e4;--font-panel-muted:#a1a3aa;--font-panel-border:#46464b;--font-panel-button:#343438;--font-panel-accent:#8bb8ff;color-scheme:dark}
    *{box-sizing:border-box}
    .panel{font:14px/1.5 'Segoe UI','Microsoft YaHei UI',sans-serif;background:var(--font-panel-bg);color:var(--font-panel-ink);border:1px solid var(--font-panel-border);border-radius:14px;padding:16px;box-shadow:0 10px 35px #0003;overflow:auto;max-height:var(--panel-max-height,calc(100vh - 24px))}
    .heading{display:flex;align-items:center;gap:10px;margin-bottom:4px}
    .title{font-size:15px;font-weight:600;margin:0;flex:1}
    .hint{margin:0 0 14px;color:var(--font-panel-muted);font-size:12px}
    button,input,select{font:inherit;color:inherit}
    button{cursor:pointer;border:1px solid var(--font-panel-border);background:var(--font-panel-button);border-radius:7px;min-height:30px;padding:4px 9px;white-space:nowrap}
    button:hover{filter:brightness(1.08)}
    button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--font-panel-accent);outline-offset:2px}
    .close{border:0;background:transparent;font-size:20px;line-height:1;padding:2px 5px;min-width:28px}
    .row{display:grid;grid-template-columns:64px minmax(50px,1fr) 30px 30px;align-items:center;gap:7px;margin-bottom:8px}
    .option{display:flex;align-items:center;gap:8px;margin:8px 0}
    .option label{flex:1}
    .section{font-size:13px;margin:12px 0 4px;padding-top:8px;border-top:1px solid var(--font-panel-border)}
    select{border:1px solid var(--font-panel-border);border-radius:7px;background:var(--font-panel-button);padding:3px 7px}
    label{font-size:13px}
    input{min-width:0;width:100%;height:32px;border:1px solid var(--font-panel-border);border-radius:7px;background:transparent;padding:4px 7px;outline:none;font-variant-numeric:tabular-nums}
    input[type=color]{width:42px;padding:3px;cursor:pointer}
    input[type=range]{width:88px;height:auto;padding:0;accent-color:var(--font-panel-accent);cursor:pointer}
    output{min-width:35px;font-size:12px;text-align:right;font-variant-numeric:tabular-nums}
    .step{width:30px;padding:2px;font-size:17px}
    .actions{display:flex;gap:8px;align-items:center;margin-top:3px}
    .apply{background:var(--font-panel-accent);border-color:var(--font-panel-accent);color:#111d32;font-weight:600;flex:1}
    .apply:disabled{opacity:.6;cursor:default}
    :host([data-theme=light]) .apply{color:white}
    .defaults{font-size:12px}
    .message{font-size:12px;line-height:1.5;color:var(--font-panel-muted);margin:12px 0 0;min-height:18px;overflow-wrap:anywhere}
    .message[data-error=true]{color:#df7381}
  `;
  const panel = element('form', 'panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  const heading = element('div', 'heading');
  const title = element('h2', 'title');
  const closeButton = element('button', 'close', '×');
  closeButton.type = 'button';
  heading.append(title, closeButton);
  const language = element('select');
  language.id = 'navigator-language';
  for (const [value, name] of [['zh', '简体中文'], ['en', 'English']]) {
    const option = element('option', '', name);
    option.value = value;
    option.lang = value === 'zh' ? 'zh-CN' : 'en';
    language.append(option);
  }
  const color = element('input');
  color.type = 'color';
  color.id = 'navigator-background';
  const autoColor = element('button', 'defaults');
  autoColor.type = 'button';
  const activeColor = element('input');
  activeColor.type = 'color';
  activeColor.id = 'navigator-active-color';
  const autoActive = element('button', 'defaults');
  autoActive.type = 'button';
  const opacity = element('input');
  opacity.type = 'range';
  opacity.id = 'navigator-opacity';
  opacity.min = '0';
  opacity.max = '100';
  const opacityValue = element('output');
  opacityValue.htmlFor = opacity.id;
  opacityValue.setAttribute('aria-hidden', 'true');
  function optionRow(input, ...extras) {
    const row = element('div', 'option');
    const label = element('label');
    label.htmlFor = input.id;
    row.append(label, input, ...extras);
    panel.append(row);
    return label;
  }
  const appearanceTitle = element('h3', 'section');
  const fontTitle = element('h3', 'section');
  const hint = element('p', 'hint');
  panel.append(heading);
  const languageLabel = optionRow(language);
  panel.append(appearanceTitle);
  const colorLabel = optionRow(color, autoColor);
  const opacityLabel = optionRow(opacity, opacityValue);
  const activeColorLabel = optionRow(activeColor, autoActive);
  panel.append(fontTitle, hint);
  const inputs = {};
  const fontLabels = {};
  for (const key of fontKeys) {
    const row = element('div', 'row');
    const label = element('label');
    const input = element('input');
    input.id = `font-${key}`;
    input.name = key;
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.htmlFor = input.id;
    const minus = element('button', 'step', '−');
    const plus = element('button', 'step', '+');
    minus.type = plus.type = 'button';
    minus.addEventListener('click', () => step(key, 1 / 1.1));
    plus.addEventListener('click', () => step(key, 1.1));
    input.addEventListener('input', () => { dirty = true; showMessage('changed'); });
    inputs[key] = input;
    fontLabels[key] = { label, minus, plus };
    row.append(label, input, minus, plus);
    panel.append(row);
  }
  const actions = element('div', 'actions');
  const applyButton = element('button', 'apply');
  applyButton.type = 'submit';
  const defaultsButton = element('button', 'defaults');
  defaultsButton.type = 'button';
  actions.append(applyButton, defaultsButton);
  const message = element('p', 'message');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  panel.append(actions, message);
  shadow.append(style, panel);
  document.body.append(host);

  let destroyed = false;
  let panelOpen = false;
  let dirty = false;
  let appearanceDirty = false;
  let pendingSave = null;
  let error = '';
  let messageKey = 'idle';
  let font = fontFrom(globalThis.__codexEnhancementsConfig) || fontFrom(globalThis.__codexFontFreeConfig) || { ...defaults };
  let appearance = appearanceFrom(globalThis.__codexEnhancementsConfig);
  let railHost = null;
  let header = null;
  let button = null;
  let headerStyle = null;
  let conversationKey = null;
  let previousFocus = null;
  let saveTimer = 0;

  function syncInputs() {
    for (const key of fontKeys) inputs[key].value = String(font[key]);
  }
  function showMessage(key, isError = false) {
    messageKey = key;
    const text = copy[appearance.language][key];
    error = isError ? text : '';
    message.textContent = text;
    message.dataset.error = String(isError);
  }
  function translateButton() {
    if (!button) return;
    const words = copy[appearance.language];
    button.textContent = words.settings;
    button.title = words.open;
    button.setAttribute('aria-label', words.open);
    button.lang = host.lang;
  }
  function translate() {
    const words = copy[appearance.language];
    host.lang = appearance.language === 'zh' ? 'zh-CN' : 'en';
    panel.setAttribute('aria-label', words.title);
    title.textContent = words.title;
    closeButton.setAttribute('aria-label', words.close);
    languageLabel.textContent = words.language;
    appearanceTitle.textContent = words.appearance;
    colorLabel.textContent = words.color;
    autoColor.textContent = words.autoColor;
    opacityLabel.textContent = words.opacity;
    activeColorLabel.textContent = words.activeColor;
    autoActive.textContent = words.autoActive;
    fontTitle.textContent = words.fonts;
    hint.textContent = words.hint;
    for (const key of fontKeys) {
      const { label, minus, plus } = fontLabels[key];
      label.textContent = words[key];
      inputs[key].setAttribute('aria-label', words.size(words[key]));
      minus.setAttribute('aria-label', words.smaller(words[key]));
      plus.setAttribute('aria-label', words.larger(words[key]));
    }
    applyButton.textContent = words.apply;
    defaultsButton.textContent = words.defaults;
    defaultsButton.title = words.reset;
    translateButton();
    showMessage(messageKey, Boolean(error));
  }
  function syncAppearance() {
    language.value = appearance.language;
    const dark = railHost?.dataset.theme === 'dark';
    color.value = appearance.color || (dark ? '#232325' : '#fafafa');
    autoColor.disabled = appearance.color === null;
    activeColor.value = appearance.activeColor || (dark ? '#63e6be' : '#08775d');
    autoActive.disabled = appearance.activeColor === null;
    opacity.value = String(appearance.opacity);
    opacityValue.value = `${appearance.opacity}%`;
    globalThis.__codexChatNavigator?.setAppearance?.(appearance);
  }
  function previewAppearance(change) {
    appearance = { ...appearance, ...change };
    appearanceDirty = true;
    if (change.language) translate();
    syncAppearance();
    showMessage('changed');
    placePanel();
  }
  function step(key, factor) {
    const old = Number(inputs[key].value.trim());
    const next = old * factor;
    if (!valid(old) || !valid(next)) {
      showMessage('invalid', true);
      return;
    }
    inputs[key].value = String(Number(next.toPrecision(12)));
    dirty = true;
    showMessage('changed');
  }
  function collect() {
    const result = {};
    for (const key of fontKeys) result[key] = Number(inputs[key].value.trim());
    return fontFrom(result);
  }
  function apply(onlyFonts = false) {
    if (pendingSave) return;
    const payload = {};
    if (onlyFonts || dirty || !appearanceDirty) {
      const next = onlyFonts ? { ...defaults } : collect();
      if (!next) { showMessage('invalid', true); return; }
      if (typeof globalThis.__codexFontFree_v1?.update !== 'function') {
        showMessage('notReady', true);
        return;
      }
      font = payload.font = next;
      globalThis.__codexFontFreeConfig = { ...font };
      globalThis.__codexEnhancementsConfig = { ...globalThis.__codexEnhancementsConfig, ...font };
      globalThis.__codexFontFree_v1.update(font);
      syncInputs();
      dirty = false;
    }
    if (!onlyFonts && appearanceDirty) {
      payload.appearance = { ...appearance };
      appearanceDirty = false;
    }
    pendingSave = payload;
    applyButton.disabled = defaultsButton.disabled = true;
    showMessage('pending');
    if (typeof globalThis.__codexEnhancementsSave !== 'function') {
      finishSave(false, 'disconnected');
      return;
    }
    try {
      saveTimer = setTimeout(() => finishSave(false, 'timeout'), 7000);
      globalThis.__codexEnhancementsSave(JSON.stringify(payload));
    } catch {
      finishSave(false, 'failed');
    }
  }
  function finishSave(ok, key) {
    if (destroyed || !pendingSave) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    if (ok) {
      globalThis.__codexEnhancementsConfig = { ...globalThis.__codexEnhancementsConfig, ...pendingSave.font };
      if (pendingSave.appearance) globalThis.__codexEnhancementsConfig.appearance = pendingSave.appearance;
    } else {
      dirty ||= Boolean(pendingSave.font);
      appearanceDirty ||= Boolean(pendingSave.appearance);
    }
    pendingSave = null;
    applyButton.disabled = defaultsButton.disabled = false;
    showMessage(key, !ok);
  }
  function notifySaveResult(result) { finishSave(result?.ok === true, result?.ok === true ? 'saved' : 'failed'); }
  function visibleRect(node) {
    if (!node?.isConnected || !node.getClientRects().length) return null;
    const rect = node.getBoundingClientRect();
    const css = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && css.visibility !== 'hidden' ? rect : null;
  }
  function placePanel() {
    if (!panelOpen || !railHost) return;
    const railRect = visibleRect(railHost.shadowRoot?.querySelector('.shell'));
    if (!railRect) { setOpen(false); return; }
    const width = Math.min(324, Math.max(180, innerWidth - 24));
    const left = railRect.left >= width + 22
      ? railRect.left - width - 10
      : Math.max(12, Math.min(innerWidth - width - 12, railRect.right - width));
    let bottom = innerHeight - 12;
    for (const node of document.querySelectorAll('.composer-surface-chrome,[data-composer-surface-variant]')) {
      const rect = visibleRect(node);
      if (rect && rect.top > 100 && rect.left < left + width && rect.right > left) bottom = Math.min(bottom, rect.top - 12);
    }
    panel.style.setProperty('--panel-max-height', `${Math.max(80, bottom - 12)}px`);
    host.style.width = `${width}px`;
    const height = Math.min(panel.scrollHeight || 320, Math.max(80, bottom - 12));
    const top = Math.max(12, Math.min(railRect.top, bottom - height));
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    const theme = railHost.dataset.theme === 'dark' ? 'dark' : 'light';
    if (host.dataset.theme !== theme) host.dataset.theme = theme;
  }
  function setOpen(value, focus = false) {
    if (destroyed) return;
    if (value && !button?.isConnected) return;
    panelOpen = Boolean(value);
    host.hidden = !panelOpen;
    host.style.display = panelOpen ? 'block' : 'none';
    button?.setAttribute('aria-expanded', String(panelOpen));
    globalThis.__codexChatNavigator?.setSettingsOpen?.(panelOpen);
    railResize.disconnect();
    if (panelOpen) {
      if (!dirty) syncInputs();
      syncAppearance();
      previousFocus = railHost.shadowRoot?.activeElement || button;
      const shell = railHost.shadowRoot?.querySelector('.shell');
      if (shell) railResize.observe(shell);
      placePanel();
      if (focus) language.focus({ preventScroll: true });
    } else if (focus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  function attachButton() {
    const nextRail = document.getElementById('codex-chat-navigator');
    const nextHeader = nextRail?.shadowRoot?.querySelector('.header');
    if (nextHeader === header && button?.isConnected) return;
    button?.remove();
    headerStyle?.remove();
    if (panelOpen) setOpen(false);
    railHost = nextRail;
    header = nextHeader;
    button = headerStyle = null;
    if (!header) return;
    headerStyle = element('style');
    headerStyle.dataset.codexEnhancements = 'font-button';
    headerStyle.textContent = `#${BUTTON_ID}{appearance:none;flex:0 0 auto;font:12px/1.4 'Segoe UI','Microsoft YaHei UI',sans-serif;color:var(--nav-text);background:transparent;border:1px solid var(--nav-border);border-radius:5px;min-height:24px;padding:2px 7px;cursor:pointer}#${BUTTON_ID}:hover{color:var(--nav-active);background:var(--nav-hover)}#${BUTTON_ID}:focus-visible{outline:2px solid var(--nav-active);outline-offset:2px}`;
    railHost.shadowRoot.append(headerStyle);
    button = element('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', event => { event.stopPropagation(); setOpen(!panelOpen, true); });
    header.append(button);
    translateButton();
  }
  function snapshot() {
    let navigation = null;
    try { navigation = globalThis.__codexChatNavigator?.snapshot() || null; } catch {}
    return { font: { ...font }, appearance: { ...appearance }, navigation, panelOpen, dirty: dirty || appearanceDirty,
      saving: Boolean(pendingSave), error, ready: Boolean(button?.isConnected) };
  }
  function refresh(config) {
    if (destroyed) return snapshot();
    const source = config || globalThis.__codexEnhancementsConfig;
    const next = fontFrom(source);
    if (next && !dirty && !pendingSave?.font) {
      font = next;
      syncInputs();
    }
    if (!appearanceDirty && !pendingSave?.appearance) {
      const previousLanguage = appearance.language;
      appearance = appearanceFrom(source);
      if (appearance.language !== previousLanguage) translate();
    }
    attachButton();
    syncAppearance();
    let key = null;
    try { key = globalThis.__codexChatNavigator?.snapshot().conversationKey || null; } catch {}
    if (conversationKey != null && key !== conversationKey && panelOpen) setOpen(false);
    conversationKey = key;
    if (panelOpen) placePanel();
    return snapshot();
  }
  function outside(event) {
    if (!panelOpen) return;
    const path = event.composedPath();
    if (path.includes(host) || path.includes(button)) return;
    setOpen(false);
  }
  function keydown(event) {
    if (event.key === 'Escape' && panelOpen) {
      event.preventDefault(); event.stopPropagation(); setOpen(false, true);
    }
  }
  function destroy() {
    if (destroyed) return;
    if (panelOpen) setOpen(false);
    destroyed = true;
    clearInterval(interval);
    if (saveTimer) clearTimeout(saveTimer);
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('resize', resize);
    host.remove();button?.remove();headerStyle?.remove();
    if (globalThis[API] === api) delete globalThis[API];
  }
  const resize = () => { if (panelOpen) placePanel(); };
  const railResize = new ResizeObserver(resize);
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('resize', resize);
  closeButton.addEventListener('click', () => setOpen(false, true));
  language.addEventListener('change', () => previewAppearance({ language: language.value }));
  color.addEventListener('input', () => previewAppearance({ color: color.value }));
  autoColor.addEventListener('click', () => previewAppearance({ color: null }));
  activeColor.addEventListener('input', () => previewAppearance({ activeColor: activeColor.value }));
  autoActive.addEventListener('click', () => previewAppearance({ activeColor: null }));
  opacity.addEventListener('input', () => previewAppearance({ opacity: Number(opacity.value) }));
  panel.addEventListener('submit', event => { event.preventDefault(); apply(); });
  panel.addEventListener('keydown', keydown, true);
  defaultsButton.addEventListener('click', () => apply(true));
  const interval = setInterval(() => refresh(), 1000);
  const api = { refresh, snapshot, destroy, notifySaveResult, get destroyed() { return destroyed; } };
  globalThis[API] = api;
  translate();
  return refresh();
})()
