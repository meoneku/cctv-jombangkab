import { getCameraById } from "./cctvSource.mjs";

const STREAM_TIMEOUT_MS = 25000;
const IDLE_CLOSE_DELAY_MS = 2000;
const RECONNECT_DELAYS_MS = [1500, 3000, 6000];

// Mengemas header 2-byte panjang ID kamera + ID UTF-8 + payload JPEG ke dalam satu buffer WebSocket
function encodeFramePacket(cameraId, jpegBuffer) {
  const idBytes = Buffer.from(String(cameraId), "utf8");
  const packet = Buffer.allocUnsafe(2 + idBytes.length + jpegBuffer.length);
  packet.writeUInt16BE(idBytes.length, 0);
  idBytes.copy(packet, 2);
  jpegBuffer.copy(packet, 2 + idBytes.length);
  return packet;
}

export class MjpegMultiplexer {
  constructor() {
    this.streams = new Map();
    this.clients = new Map();
  }

  registerClient(ws) {
    const clientState = {
      ws,
      cameras: new Set(),
      focusId: null,
      maxFps: 8,
      lastSentAt: new Map(),
    };
    this.clients.set(ws, clientState);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString("utf8"));
        if (msg.type === "subscribe") {
          this.updateSubscription(ws, msg);
        }
      } catch {
        // Abaikan pesan WebSocket yang tidak valid
      }
    });

    ws.on("close", () => {
      this.unregisterClient(ws);
    });

    ws.on("error", () => {
      this.unregisterClient(ws);
    });
  }

  unregisterClient(ws) {
    const clientState = this.clients.get(ws);
    if (!clientState) return;
    for (const camId of clientState.cameras) {
      this.detachSubscriber(camId, ws);
    }
    this.clients.delete(ws);
  }

  updateSubscription(ws, msg) {
    const clientState = this.clients.get(ws);
    if (!clientState) return;

    const requested = Array.isArray(msg.cameras)
      ? [...new Set(msg.cameras.map((id) => String(id)).slice(0, 12))]
      : [];
    const nextSet = new Set(requested);

    clientState.focusId = msg.focusId ? String(msg.focusId) : null;
    clientState.maxFps = Math.min(24, Math.max(1, Number(msg.maxFps) || 8));

    for (const oldId of clientState.cameras) {
      if (!nextSet.has(oldId)) {
        this.detachSubscriber(oldId, ws);
      }
    }

    for (const newId of nextSet) {
      if (!clientState.cameras.has(newId)) {
        this.attachSubscriber(newId, ws);
      }
    }

    clientState.cameras = nextSet;
  }

  attachSubscriber(cameraId, ws) {
    let stream = this.streams.get(cameraId);
    if (!stream) {
      stream = {
        cameraId,
        subscribers: new Set(),
        abortController: null,
        closeTimer: null,
        reconnectTimer: null,
        retryCount: 0,
        status: "connecting",
        lastFrame: null,
        running: false,
      };
      this.streams.set(cameraId, stream);
    }

    if (stream.closeTimer) {
      clearTimeout(stream.closeTimer);
      stream.closeTimer = null;
    }

    stream.subscribers.add(ws);
    this.sendStatus(ws, cameraId, stream.status);

    if (stream.lastFrame && ws.readyState === 1) {
      ws.send(encodeFramePacket(cameraId, stream.lastFrame), { binary: true });
    }

    if (!stream.running) {
      this.startUpstream(stream);
    }
  }

  detachSubscriber(cameraId, ws) {
    const stream = this.streams.get(cameraId);
    if (!stream) return;
    stream.subscribers.delete(ws);

    if (stream.subscribers.size === 0 && !stream.closeTimer) {
      stream.closeTimer = setTimeout(() => {
        if (stream.subscribers.size === 0) {
          this.stopUpstream(stream);
          this.streams.delete(cameraId);
        }
      }, IDLE_CLOSE_DELAY_MS);
    }
  }

  sendStatus(ws, cameraId, status, message = "") {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "status", cameraId, status, message }));
  }

  broadcastStatus(stream, status, message = "") {
    stream.status = status;
    for (const ws of stream.subscribers) {
      this.sendStatus(ws, stream.cameraId, status, message);
    }
  }

  broadcastFrame(stream, jpegBuffer) {
    stream.lastFrame = jpegBuffer;
    if (stream.status !== "live") {
      this.broadcastStatus(stream, "live");
    }

    const now = Date.now();
    let packet = null;

    for (const ws of stream.subscribers) {
      if (ws.readyState !== 1) continue;
      if (ws.bufferedAmount > 512 * 1024) continue;

      const clientState = this.clients.get(ws);
      if (!clientState) continue;

      const isFocused = clientState.focusId === stream.cameraId;
      const targetFps = isFocused ? 20 : clientState.maxFps;
      const minIntervalMs = 1000 / targetFps;
      const lastSent = clientState.lastSentAt.get(stream.cameraId) || 0;

      if (now - lastSent < minIntervalMs) continue;
      clientState.lastSentAt.set(stream.cameraId, now);

      if (!packet) {
        packet = encodeFramePacket(stream.cameraId, jpegBuffer);
      }
      ws.send(packet, { binary: true });
    }
  }

  async startUpstream(stream) {
    if (stream.running || stream.subscribers.size === 0) return;
    stream.running = true;
    this.broadcastStatus(stream, "connecting");

    const controller = new AbortController();
    stream.abortController = controller;

    let watchdog = null;
    const resetWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        controller.abort(new Error("Stream timeout"));
      }, STREAM_TIMEOUT_MS);
    };

    try {
      const forceRefresh = stream.retryCount > 0;
      const camera = await getCameraById(stream.cameraId, forceRefresh);
      if (!camera || !camera.url) {
        throw new Error("Kamera tidak ditemukan");
      }

      resetWatchdog();
      const response = await fetch(camera.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "JombangCCTV-MultiMonitor/1.0",
        },
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      await this.consumeMultipartStream(reader, stream, resetWatchdog, controller.signal);
    } catch (err) {
      if (stream.subscribers.size > 0 && !controller.signal.aborted) {
        this.broadcastStatus(stream, "error", err?.message || "Koneksi terputus");
      } else if (stream.subscribers.size > 0 && err?.message === "Stream timeout") {
        this.broadcastStatus(stream, "error", "Stream tidak merespons");
      }
    } finally {
      if (watchdog) clearTimeout(watchdog);
      stream.running = false;
      stream.abortController = null;

      if (stream.subscribers.size > 0) {
        const delayIdx = Math.min(stream.retryCount, RECONNECT_DELAYS_MS.length - 1);
        const delayMs = RECONNECT_DELAYS_MS[delayIdx];
        stream.retryCount += 1;
        stream.reconnectTimer = setTimeout(() => {
          stream.reconnectTimer = null;
          if (stream.subscribers.size > 0) {
            this.startUpstream(stream);
          }
        }, delayMs);
      }
    }
  }

  stopUpstream(stream) {
    if (stream.reconnectTimer) {
      clearTimeout(stream.reconnectTimer);
      stream.reconnectTimer = null;
    }
    if (stream.abortController) {
      stream.abortController.abort();
      stream.abortController = null;
    }
    stream.running = false;
  }

  // Memecah stream multipart ZoneMinder berbasis Content-Length menjadi frame JPEG utuh
  async consumeMultipartStream(reader, stream, onFrameActivity, signal) {
    let buffer = Buffer.alloc(0);
    const separator = Buffer.from("\r\n\r\n");

    while (!signal.aborted && stream.subscribers.size > 0) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      buffer = buffer.length === 0
        ? Buffer.from(value)
        : Buffer.concat([buffer, Buffer.from(value)]);

      while (true) {
        const headerEnd = buffer.indexOf(separator);
        if (headerEnd === -1) break;

        const headerText = buffer.subarray(0, headerEnd).toString("latin1");
        const match = headerText.match(/Content-Length:\s*(\d+)/i);
        const bodyStart = headerEnd + separator.length;

        if (!match) {
          buffer = buffer.subarray(bodyStart);
          continue;
        }

        const contentLength = parseInt(match[1], 10);
        if (!Number.isFinite(contentLength) || contentLength <= 0) {
          buffer = buffer.subarray(bodyStart);
          continue;
        }

        if (buffer.length < bodyStart + contentLength) {
          break;
        }

        const jpegFrame = Buffer.from(buffer.subarray(bodyStart, bodyStart + contentLength));
        buffer = buffer.subarray(bodyStart + contentLength);
        stream.retryCount = 0;
        onFrameActivity();
        this.broadcastFrame(stream, jpegFrame);
      }

      if (buffer.length > 2 * 1024 * 1024) {
        buffer = Buffer.alloc(0);
      }
    }

    try {
      await reader.cancel();
    } catch {
      // Abaikan error pembatalan reader saat koneksi ditutup
    }
  }

  async getSnapshot(cameraId) {
    const existing = this.streams.get(String(cameraId));
    if (existing?.lastFrame) {
      return existing.lastFrame;
    }

    const camera = await getCameraById(cameraId);
    if (!camera || !camera.url) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(camera.url, { signal: controller.signal });
      if (!res.ok || !res.body) return null;
      const reader = res.body.getReader();
      let buffer = Buffer.alloc(0);
      const separator = Buffer.from("\r\n\r\n");

      while (buffer.length < 1024 * 1024) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer = Buffer.concat([buffer, Buffer.from(value)]);
        const headerEnd = buffer.indexOf(separator);
        if (headerEnd === -1) continue;
        const headerText = buffer.subarray(0, headerEnd).toString("latin1");
        const match = headerText.match(/Content-Length:\s*(\d+)/i);
        if (!match) continue;
        const contentLength = parseInt(match[1], 10);
        const bodyStart = headerEnd + separator.length;
        if (buffer.length >= bodyStart + contentLength) {
          const frame = Buffer.from(buffer.subarray(bodyStart, bodyStart + contentLength));
          await reader.cancel();
          return frame;
        }
      }
      await reader.cancel();
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
