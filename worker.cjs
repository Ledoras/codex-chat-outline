/* Codex Chat Outline: local worker for fonts and chat navigation. */
'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const net = require('node:net');

const BINDING = '__codexEnhancementsSave';
const DEFAULT_APPEARANCE = { language: 'zh', color: null, opacity: 97, activeColor: null };
const CLEANUP = `(() => {
  try { globalThis.__codexEnhancements?.destroy(); } catch {}
  try { globalThis.__codexChatNavigator?.destroy(); } catch {}
  try { globalThis.__codexFontFree_v1?.reset(); } catch {}
  delete globalThis.__codexEnhancementsConfig;
  return true;
})()`;
function validFont(font) {
  return !!font && ['ui', 'code', 'chat'].every(k => typeof font[k] === 'number' && Number.isFinite(font[k]) && font[k] > 0);
}
function validColor(color) {
  return color === null || (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color));
}
function validAppearance(appearance) {
  return !!appearance && ['zh', 'en'].includes(appearance.language) &&
    validColor(appearance.color) && (appearance.activeColor === undefined || validColor(appearance.activeColor)) &&
    Number.isInteger(appearance.opacity) && appearance.opacity >= 0 && appearance.opacity <= 100;
}
function normalizeAppearance(value, previousActiveColor = null) {
  if (!validAppearance(value)) return DEFAULT_APPEARANCE;
  return {
    language: value.language,
    color: value.color?.toLowerCase() ?? null,
    opacity: value.opacity,
    activeColor: value.activeColor === undefined ? previousActiveColor : value.activeColor?.toLowerCase() ?? null
  };
}
function endpointKey(endpoint) { return `${endpoint.port}/${endpoint.browserId}`; }
function validateEndpoint(value) {
  if (!value || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535 ||
      typeof value.browserId !== 'string' || !/^[A-Za-z0-9._-]{1,200}$/.test(value.browserId) ||
      !Number.isInteger(value.ownerPid) || value.ownerPid < 1) throw new Error('连接信息无效。');
  return value;
}
function loopbackWebSocket(value, port, expectedPath) {
  let url;
  try { url = new URL(value); } catch { throw new Error('调试地址无效。'); }
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      Number(url.port) !== port || url.username || url.password || url.search || url.hash ||
      url.pathname !== expectedPath) throw new Error('调试连接必须属于同一个本机客户端。');
  return url.href;
}
function isAppTarget(target) {
  try {
    const url = new URL(target.url);
    const initialRoute = url.searchParams.get('initialRoute') || '';
    return target.type === 'page' && typeof target.id === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(target.id) &&
      url.protocol === 'app:' && url.hostname === '-' && ['/index.html', '/detached-window.html'].includes(url.pathname) &&
      initialRoute !== '/avatar-overlay' && !initialRoute.startsWith('/avatar-overlay/');
  } catch { return false; }
}
function jsonRequest(port, resource, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: resource, agent: false }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('客户端尚未开放连接。')); return; }
      let size = 0;
      const chunks = [];
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { request.destroy(new Error('客户端响应过大。')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('客户端返回了无效的连接信息。')); }
      });
      response.on('error', reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('等待客户端连接超时。')));
    request.on('error', reject);
  });
}
async function atomicJson(filename, value) {
  await fsp.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    await fsp.rename(temporary, filename);
  } finally { await fsp.unlink(temporary).catch(() => {}); }
}
async function readJson(filename) { return JSON.parse((await fsp.readFile(filename, 'utf8')).replace(/^\uFEFF/, '')); }
async function acquireWorkerLock(statusPath) {
  const directory = path.dirname(path.resolve(statusPath));
  await fsp.mkdir(directory, { recursive: true });
  const filename = path.join(directory, 'worker.lock.json');
  const key = crypto.createHash('sha256').update(process.platform === 'win32' ? directory.toLowerCase() : directory).digest('hex').slice(0, 32);
  // The OS-owned pipe serializes stale-file recovery and disappears even after
  // a forced Windows process termination. No stale-file takeover can race a new owner.
  const address = process.platform === 'win32' ? `\\\\.\\pipe\\CodexChatOutline-${key}` : `\0codex-chat-outline-${key}`;
  const guard = net.createServer(socket => socket.destroy());
  const acquired = await new Promise((resolve, reject) => {
    guard.once('error', error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    guard.listen(address, () => resolve(true));
  });
  if (!acquired) return null;
  const closeGuard = () => new Promise(resolve => guard.close(resolve));
  const owner = { pid: process.pid, nonce: crypto.randomBytes(16).toString('hex') };
  try {
    let previous;
    try { previous = await readJson(filename); }
    catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    // Owning the OS pipe proves no live worker owns this directory. A stale
    // file PID can belong to an unrelated process after Windows reuses it.
    await fsp.unlink(filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await fsp.writeFile(filename, JSON.stringify(owner), { encoding: 'utf8', flag: 'wx' });
  } catch (error) { await closeGuard(); throw error; }
  let released = false;
  return async () => {
    if (released) return; released = true;
    try {
      const current = await readJson(filename);
      if (current.pid === owner.pid && current.nonce === owner.nonce) await fsp.unlink(filename);
    } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    finally { await closeGuard(); }
  };
}
function safeError(error) {
  // Never write CDP exceptionDetails or binding payloads, which can include page text.
  const known = ['连接信息无效。', '调试地址无效。', '调试连接必须属于同一个本机客户端。',
    '客户端尚未开放连接。', '等待客户端连接超时。', '客户端返回了无效的连接信息。',
    '客户端响应过大。', '客户端身份已经变化，正在等待新的启动信息。', '字号设置无效。',
    '页面增强脚本执行失败。', '未找到客户端页面。'];
  return known.includes(error?.message) ? error.message : '客户端暂时不可连接，后台会自动重试。';
}

class CdpConnection {
  constructor(url, onEvent, timeoutMs = 5000) {
    this.url = url; this.onEvent = onEvent; this.timeoutMs = timeoutMs; this.nextId = 0;
    this.pending = new Map(); this.socket = null; this.closed = false;
  }
  async open() {
    const socket = this.socket = new WebSocket(this.url);
    socket.addEventListener('message', event => {
      let value;
      try { value = JSON.parse(String(event.data)); } catch { return; }
      const pending = this.pending.get(value.id);
      if (pending) {
        this.pending.delete(value.id); clearTimeout(pending.timer);
        if (value.error) {
          const error = new Error(`CDP command failed: ${pending.method}`);
          error.cdpCode = value.error.code;
          pending.reject(error);
        } else pending.resolve(value.result || {});
      } else if (value.method) {
        try { this.onEvent?.(value); } catch {}
      }
    });
    socket.addEventListener('close', () => this.failAll(new Error('CDP connection closed')));
    socket.addEventListener('error', () => this.failAll(new Error('CDP connection failed')));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('CDP connection timeout')); }, this.timeoutMs);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
      socket.addEventListener('close', () => { clearTimeout(timer); reject(new Error('CDP connection closed')); }, { once: true });
    });
    return this;
  }
  call(method, params = {}) {
    return new Promise((resolve, reject) => {
      if (this.closed || this.socket?.readyState !== WebSocket.OPEN) { reject(new Error('CDP connection closed')); return; }
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new Error(`CDP command timeout: ${method}`));
        this.dispose();
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  failAll(error) {
    this.closed = true;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
  dispose() { this.failAll(new Error('CDP connection closed')); try { this.socket?.close(); } catch {} }
}

class Worker {
  constructor(options) {
    this.configPath = path.resolve(options.config);
    this.endpointPath = path.resolve(options.endpoint);
    this.statusPath = path.resolve(options.status);
    this.assetRoot = path.resolve(options.assets || path.dirname(this.configPath));
    this.pinnedEndpoint = options.pinnedEndpoint || null;
    this.intervalMs = options.intervalMs || 3000;
    this.commandTimeoutMs = options.commandTimeoutMs || 5000;
    this.slots = new Map(); this.endpoint = null; this.busy = false; this.stopped = false;
    this.timer = null; this.writeQueue = Promise.resolve(); this.lastStatus = null;
    this.assets = null;
  }
  async loadConfig() {
    const value = await readJson(this.configPath);
    if (!validFont(value.font)) throw new Error('字号设置无效。');
    return value;
  }
  loadAssets() {
    if (!this.assets) this.assets = Object.fromEntries(['font-override.js', 'navigator.js', 'integration.js']
      .map(name => [name, fs.readFileSync(path.join(this.assetRoot, name), 'utf8')]));
    return this.assets;
  }
  compose(config) {
    const assets = this.loadAssets();
    const font = { ui: config.font.ui, code: config.font.code, chat: config.font.chat };
    const uiConfig = { ...font, navigation: config.navigation !== false, appearance: normalizeAppearance(config.appearance) };
    const script = `(() => {
const initialRoute=new URLSearchParams(location.search).get('initialRoute') || '';
if (globalThis.top !== globalThis.self || location.protocol !== 'app:' || location.hostname !== '-' || !['/index.html','/detached-window.html'].includes(location.pathname) || initialRoute === '/avatar-overlay' || initialRoute.startsWith('/avatar-overlay/')) return {font:{applied:false},navigation:null,ui:null};
globalThis.__codexFontFreeConfig=${JSON.stringify(font)};
globalThis.__codexEnhancementsConfig=${JSON.stringify(uiConfig)};
const fontResult=${assets['font-override.js']}
;
let navigationResult=null;
if (${config.navigation !== false}) { navigationResult=${assets['navigator.js']}\n; }
else { try { globalThis.__codexChatNavigator?.destroy(); } catch {} }
const uiResult=${assets['integration.js']}
;
return {font:fontResult,navigation:navigationResult,ui:uiResult};
})()`;
    return { script, hash: crypto.createHash('sha256').update(script).digest('hex') };
  }
  async verifyEndpoint(endpoint) {
    const version = await jsonRequest(endpoint.port, '/json/version');
    loopbackWebSocket(version.webSocketDebuggerUrl, endpoint.port, `/devtools/browser/${endpoint.browserId}`);
  }
  onEvent(slot, event) {
    if (event.method !== 'Runtime.bindingCalled' || event.params?.name !== BINDING) return;
    const params = event.params;
    this.writeQueue = this.writeQueue.then(async () => {
      let reply;
      try {
        if (typeof params.payload !== 'string' || params.payload.length > 2048) throw new Error('invalid');
        const input = JSON.parse(params.payload);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid');
        const hasAppearance = Object.hasOwn(input, 'appearance');
        const hasWrappedFont = Object.hasOwn(input, 'font');
        const hasFont = hasWrappedFont || !hasAppearance || ['ui', 'code', 'chat'].some(key => Object.hasOwn(input, key));
        const font = hasWrappedFont ? input.font : input;
        if ((hasFont && !validFont(font)) || (hasAppearance && !validAppearance(input.appearance))) throw new Error('invalid');
        const current = await this.loadConfig();
        if (hasFont) current.font = { ui: font.ui, code: font.code, chat: font.chat };
        if (hasAppearance) {
          const previousActiveColor = normalizeAppearance(current.appearance).activeColor;
          current.appearance = normalizeAppearance(input.appearance, previousActiveColor);
        }
        await atomicJson(this.configPath, current);
        reply = { ok: true };
      } catch { reply = { ok: false, error: '无法保存设置，请检查输入，或确认配置目录可写。' }; }
      if (slot.connection && !slot.connection.closed) {
        const parameters = { expression: `globalThis.__codexEnhancements?.notifySaveResult(${JSON.stringify(reply)})`, returnByValue: true };
        if (Number.isInteger(params.executionContextId)) parameters.contextId = params.executionContextId;
        await slot.connection.call('Runtime.evaluate', parameters).catch(() => {});
      }
    }).catch(() => {});
  }
  async connectSlot(slot, endpoint, target) {
    const url = loopbackWebSocket(target.webSocketDebuggerUrl, endpoint.port, `/devtools/page/${target.id}`);
    slot.connection = await new CdpConnection(url, event => this.onEvent(slot, event), this.commandTimeoutMs).open();
    await slot.connection.call('Runtime.enable');
    await slot.connection.call('Runtime.addBinding', { name: BINDING });
    // Keep identifiers after a lost transport; a reconnect can remove scripts
    // left behind by the old session instead of accumulating reload hooks.
    await this.removeScripts(slot);
    slot.hash = '';
  }
  async removeScripts(slot) {
    for (const identifier of [...slot.scriptIds]) {
      try { await slot.connection.call('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
      catch (error) {
        // Detached sessions may already have removed their registered script.
        if (slot.connection.closed || error.cdpCode == null) throw error;
      }
      slot.scriptIds.delete(identifier);
    }
  }
  async syncSlot(slot, endpoint, target, payload) {
    if (!slot.connection || slot.connection.closed) await this.connectSlot(slot, endpoint, target);
    if (slot.hash !== payload.hash) {
      await this.removeScripts(slot);
      const result = await slot.connection.call('Page.addScriptToEvaluateOnNewDocument', { source: payload.script });
      if (typeof result.identifier !== 'string') throw new Error('invalid script identifier');
      slot.scriptIds.add(result.identifier); slot.hash = payload.hash;
    }
    const evaluated = await slot.connection.call('Runtime.evaluate', { expression: payload.script, returnByValue: true });
    if (evaluated.exceptionDetails) throw new Error('页面增强脚本执行失败。');
    return evaluated.result?.value || {};
  }
  async closeSessions(restore = true) {
    for (const slot of this.slots.values()) {
      if (restore && slot.connection && !slot.connection.closed) {
        await this.removeScripts(slot).catch(() => {});
        await slot.connection.call('Runtime.evaluate', { expression: CLEANUP, returnByValue: true }).catch(() => {});
        await slot.connection.call('Runtime.removeBinding', { name: BINDING }).catch(() => {});
      }
      slot.connection?.dispose();
    }
    this.slots.clear();
  }
  async writeStatus(status) {
    this.lastStatus = { ...status, updatedAt: new Date().toISOString(), workerPid: process.pid };
    await atomicJson(this.statusPath, this.lastStatus);
  }
  async tick() {
    if (this.busy || this.stopped) return this.lastStatus;
    this.busy = true;
    let status;
    try {
      const endpoint = this.pinnedEndpoint || validateEndpoint(await readJson(this.endpointPath));
      await this.verifyEndpoint(endpoint);
      if (!this.endpoint || endpointKey(endpoint) !== endpointKey(this.endpoint)) {
        await this.closeSessions(true); this.endpoint = endpoint;
      }
      const config = await this.loadConfig();
      const targets = await jsonRequest(endpoint.port, '/json/list');
      if (!Array.isArray(targets)) throw new Error('客户端返回了无效的连接信息。');
      const payload = this.compose(config);
      const present = new Set();
      let windows = 0, messages = 0, fontApplied = false, failed = false;
      for (const target of targets.filter(isAppTarget)) {
        present.add(target.id);
        let slot = this.slots.get(target.id);
        if (!slot) { slot = { id: target.id, connection: null, hash: '', scriptIds: new Set() }; this.slots.set(target.id, slot); }
        try {
          const value = await this.syncSlot(slot, endpoint, target, payload);
          windows++; fontApplied ||= value.font?.applied === true;
          if (Number.isInteger(value.navigation?.items) && value.navigation.items >= 0) messages += value.navigation.items;
        } catch {
          failed = true; slot.connection?.dispose(); slot.connection = null;
        }
      }
      for (const [id, slot] of this.slots) if (!present.has(id)) {
        if (slot.connection && !slot.connection.closed) {
          await this.removeScripts(slot).catch(() => {});
          await slot.connection.call('Runtime.evaluate', { expression: CLEANUP, returnByValue: true }).catch(() => {});
          await slot.connection.call('Runtime.removeBinding', { name: BINDING }).catch(() => {});
        }
        slot.connection?.dispose(); this.slots.delete(id);
      }
      status = { status: windows ? 'connected' : 'waiting', port: endpoint.port, windows, messageCount: messages,
        fontApplied, navigationEnabled: config.navigation !== false,
        error: failed ? '部分窗口暂时不可连接，后台会自动重试。' : windows ? '' : '未找到客户端页面。' };
    } catch (error) {
      status = { status: 'waiting', port: this.endpoint?.port || null, windows: 0, messageCount: 0,
        fontApplied: false, error: safeError(error) };
    }
    try { await this.writeStatus(status); }
    finally { this.busy = false; }
    return status;
  }
  async start() { await this.tick(); if (!this.stopped) this.timer = setInterval(() => { this.tick().catch(() => {}); }, this.intervalMs); return this; }
  async stop({ restore = true, writeStatus = true } = {}) {
    this.stopped = true; clearInterval(this.timer); this.timer = null;
    while (this.busy) await new Promise(resolve => setTimeout(resolve, 20));
    await this.writeQueue.catch(() => {});
    await this.closeSessions(restore);
    if (writeStatus) await this.writeStatus({ status: 'stopped', port: this.endpoint?.port || null, windows: 0, messageCount: 0, error: '' }).catch(() => {});
  }
}

function parseArguments(argv) {
  const options = { once: false, exitWithClient: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--once') options.once = true;
    else if (argv[i] === '--exit-with-client') options.exitWithClient = true;
    else if (['--config', '--endpoint', '--status', '--assets'].includes(argv[i])) {
      const name = argv[i].slice(2), value = argv[++i]; if (!value) throw new Error(`Missing ${name}`); options[name] = value;
    } else throw new Error('Unsupported argument');
  }
  for (const key of ['config', 'endpoint', 'status']) if (!options[key]) throw new Error(`Missing --${key}`);
  return options;
}
function ownerIsRunning(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}
module.exports = { Worker, CdpConnection, validFont, validateEndpoint, loopbackWebSocket, isAppTarget, atomicJson, parseArguments, acquireWorkerLock, BINDING, CLEANUP };
if (require.main === module) (async () => {
  const options = parseArguments(process.argv.slice(2));
  const pinnedEndpoint = options.exitWithClient ? validateEndpoint(await readJson(options.endpoint)) : null;
  const release = await acquireWorkerLock(options.status);
  if (!release) return;
  const shutdownPath = path.join(path.dirname(path.resolve(options.status)), 'shutdown.flag');
  await fsp.unlink(shutdownPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
  const worker = new Worker({ ...options, pinnedEndpoint });
  let closing = false, shutdownTimer;
  const quit = async () => {
    if (closing) return; closing = true; clearInterval(shutdownTimer);
    try { await worker.stop(); } finally { await release(); }
    process.exit(0);
  };
  process.on('SIGINT', quit); process.on('SIGTERM', quit);
  try {
    if (options.once) {
      const result = await worker.tick(); await worker.stop({ writeStatus: false });
      await release();
      console.log(JSON.stringify(result)); process.exitCode = result.status === 'connected' ? 0 : 2;
    } else {
      shutdownTimer = setInterval(() => {
        if (fs.existsSync(shutdownPath) || (pinnedEndpoint && !ownerIsRunning(pinnedEndpoint.ownerPid))) {
          quit().catch(() => process.exit(1));
        }
      }, 250);
      await worker.start();
    }
  } catch (error) { clearInterval(shutdownTimer); await worker.stop().catch(() => {}); await release(); throw error; }
})().catch(() => { process.stderr.write('Codex Chat Outline could not start.\n'); process.exitCode = 1; });
