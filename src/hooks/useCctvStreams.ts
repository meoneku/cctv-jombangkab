"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamMetrics, StreamStatus } from "@/types/cctv";

type FrameListener = (blob: Blob) => void;

export function useCctvStreams(
  cameraIds: string[],
  focusId: string | null,
  maxFps: number
) {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<FrameListener>>>(new Map());
  const fpsCounterRef = useRef<Map<string, { count: number; windowStart: number }>>(
    new Map()
  );
  const subscriptionRef = useRef({ cameraIds, focusId, maxFps });
  subscriptionRef.current = { cameraIds, focusId, maxFps };

  const [wsConnected, setWsConnected] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, StreamMetrics>>({});

  const sendSubscription = useCallback((ws: WebSocket | null) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const { cameraIds: ids, focusId: focus, maxFps: fps } = subscriptionRef.current;
    ws.send(
      JSON.stringify({
        type: "subscribe",
        cameras: ids,
        focusId: focus,
        maxFps: fps,
      })
    );
  }, []);

  // Mendaftarkan listener biner per kamera agar pembaruan frame tidak memicu render ulang React
  const subscribeFrame = useCallback(
    (cameraId: string, listener: FrameListener) => {
      let set = listenersRef.current.get(cameraId);
      if (!set) {
        set = new Set();
        listenersRef.current.set(cameraId, set);
      }
      set.add(listener);

      return () => {
        const current = listenersRef.current.get(cameraId);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) {
          listenersRef.current.delete(cameraId);
        }
      };
    },
    []
  );

  useEffect(() => {
    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!active) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/streams`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) {
          ws.close();
          return;
        }
        setWsConnected(true);
        sendSubscription(ws);
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data) as {
              type: string;
              cameraId?: string;
              status?: StreamStatus;
              message?: string;
            };
            if (msg.type === "status" && msg.cameraId && msg.status) {
              const camId = msg.cameraId;
              const nextStatus = msg.status;
              setMetrics((prev) => ({
                ...prev,
                [camId]: {
                  status: nextStatus,
                  fps: prev[camId]?.fps ?? 0,
                  message: msg.message,
                },
              }));
            }
          } catch {
            // Abaikan pesan teks yang tidak dikenali
          }
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          // Membaca header 2-byte panjang ID kamera, ID UTF-8, lalu irisan JPEG
          const buffer = event.data;
          if (buffer.byteLength < 4) return;
          const view = new DataView(buffer);
          const idLen = view.getUint16(0, false);
          if (buffer.byteLength < 2 + idLen) return;

          const idBytes = new Uint8Array(buffer, 2, idLen);
          const cameraId = new TextDecoder().decode(idBytes);
          const jpegSlice = buffer.slice(2 + idLen);
          const blob = new Blob([jpegSlice], { type: "image/jpeg" });

          const listeners = listenersRef.current.get(cameraId);
          if (listeners) {
            for (const fn of listeners) {
              fn(blob);
            }
          }

          const now = performance.now();
          let counter = fpsCounterRef.current.get(cameraId);
          if (!counter) {
            counter = { count: 0, windowStart: now };
            fpsCounterRef.current.set(cameraId, counter);
          }
          counter.count += 1;
          const elapsed = now - counter.windowStart;
          if (elapsed >= 1000) {
            const measuredFps = Math.round((counter.count * 1000) / elapsed);
            counter.count = 0;
            counter.windowStart = now;
            setMetrics((prev) => ({
              ...prev,
              [cameraId]: {
                status: "live",
                fps: measuredFps,
                message: undefined,
              },
            }));
          }
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (active) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [sendSubscription]);

  const cameraKey = cameraIds.join(",");
  useEffect(() => {
    sendSubscription(wsRef.current);
  }, [cameraKey, focusId, maxFps, sendSubscription]);

  const reconnectCamera = useCallback(
    (cameraId: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const withoutTarget = subscriptionRef.current.cameraIds.filter(
        (id) => id !== cameraId
      );
      ws.send(
        JSON.stringify({
          type: "subscribe",
          cameras: withoutTarget,
          focusId: subscriptionRef.current.focusId,
          maxFps: subscriptionRef.current.maxFps,
        })
      );
      setTimeout(() => {
        sendSubscription(wsRef.current);
      }, 150);
    },
    [sendSubscription]
  );

  return {
    wsConnected,
    metrics,
    subscribeFrame,
    reconnectCamera,
  };
}
