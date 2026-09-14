// WebSocket client with auto-reconnect and simple event dispatch.
export class Net {
  constructor() { this.ws = null; this.handlers = {}; this.url = null; this.connected = false; this.ping = 0; this.queue = []; }
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); return this; }
  emit(type, msg) { for (const fn of this.handlers[type] || []) fn(msg); }
  connect(url) {
    if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch {} }
    this.url = url || ((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    this.emit('status', { state: 'connecting', url: this.url });
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => { this.connected = true; this.emit('status', { state: 'open', url: this.url }); for (const m of this.queue) ws.send(JSON.stringify(m)); this.queue = []; this.pingLoop(); };
    ws.onclose = () => { this.connected = false; this.emit('status', { state: 'closed', url: this.url }); clearInterval(this.pingTimer); setTimeout(() => { if (this.ws === ws) this.connect(this.url); }, 2000); };
    ws.onerror = () => { this.emit('status', { state: 'error', url: this.url }); };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (m.t === 'pong') { this.ping = performance.now() - m.ts; return; } this.emit(m.t, m); this.emit('*', m); };
  }
  pingLoop() { clearInterval(this.pingTimer); this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 2000); }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); else this.queue.push(m); }
}
