/* Codex Font Free — local style override. No network or conversation access. */
(() => {
  'use strict';
  const key = '__codexFontFree_v1';
  const input = globalThis.__codexFontFreeConfig;
  if (!input || !['ui', 'code', 'chat'].every(k =>
    typeof input[k] === 'number' && Number.isFinite(input[k]) && input[k] > 0)) {
    return { applied: false, reason: 'invalid-size' };
  }
  const root = document.documentElement;
  if (!root) return { applied: false, reason: 'document-not-ready' };
  const computed = getComputedStyle(root);
  if (!computed.getPropertyValue('--font-ui-size').trim() &&
      !computed.getPropertyValue('--codex-window-zoom').trim()) {
    return { applied: false, reason: 'not-codex-ui' };
  }
  if (globalThis[key]) {
    globalThis[key].update(input);
    return { applied: true };
  }
  const scale = {
    '--text-4xl': 72, '--text-3xl': 48, '--text-2xl': 36,
    '--text-xl': 28, '--text-lg': 16, '--text-base': 14,
    '--text-sm': 13, '--text-xs': 12, '--text-dynamic-isle-row': 14,
    '--text-heading-lg': 24, '--text-heading-app': 28,
    '--text-heading-md': 20, '--text-heading-sm': 18
  };
  const original = new Map();
  let config = { ...input };
  let stopped = false;
  function set(name, value) {
    const style = root.style;
    if (!original.has(name)) original.set(name, [
      style.getPropertyValue(name), style.getPropertyPriority(name)
    ]);
    if (style.getPropertyValue(name) !== value || style.getPropertyPriority(name) !== 'important') {
      style.setProperty(name, value, 'important');
    }
  }
  function apply() {
    if (stopped) return;
    set('--font-ui-size', `${config.ui}px`);
    set('--font-code-size', `${config.code}px`);
    set('--codex-chat-font-size-override', `${config.chat}px`);
    set('--codex-chat-code-font-size-override', `${config.code}px`);
    for (const [name, base] of Object.entries(scale)) {
      // Divide first to avoid overflow when a very large finite size is used.
      set(name, `${config.ui / 14 * base}px`);
    }
  }
  const observer = new MutationObserver(apply);
  observer.observe(root, { attributes: true, attributeFilter: ['style'] });
  globalThis[key] = {
    update(next) { config = { ...next }; apply(); },
    reset() {
      stopped = true;
      observer.disconnect();
      for (const [name, [value, priority]] of original) {
        if (value) root.style.setProperty(name, value, priority);
        else root.style.removeProperty(name);
      }
      delete globalThis[key];
      delete globalThis.__codexFontFreeConfig;
    }
  };
  apply();
  return { applied: true };
})()
