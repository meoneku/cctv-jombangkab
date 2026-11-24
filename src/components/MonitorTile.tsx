"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Replace,
  VideoOff,
  X,
} from "lucide-react";
import type { CctvCamera, StreamMetrics, StreamStatus } from "@/types/cctv";

export type TileStreamMode =
  | "idle"
  | "websocket"
  | "direct-mjpeg"
  | "direct-single";

interface MonitorTileProps {
  slotIndex: number;
  camera: CctvCamera | null;
  streamMode: TileStreamMode;
  metrics?: StreamMetrics;
  isSelectedSlot: boolean;
  isWallFullscreen: boolean;
  isFocusedCamera: boolean;
  subscribeFrame: (
    cameraId: string,
    listener: (blob: Blob) => void
  ) => () => void;
  onSelectSlot: (slotIndex: number) => void;
  onClearSlot: (slotIndex: number) => void;
  onReconnect: (cameraId: string) => void;
  onFocusChange: (cameraId: string | null) => void;
  onOpenPicker: (slotIndex: number) => void;
  onDirectStatusChange: (slotIndex: number, status: StreamStatus) => void;
}

function buildDirectSingleUrl(streamUrl: string, nonce: number) {
  try {
    const url = new URL(streamUrl);
    url.searchParams.set("mode", "single");
    url.searchParams.set("_t", `${Date.now()}_${nonce}`);
    return url.toString();
  } catch {
    return `${streamUrl}&mode=single&_t=${Date.now()}_${nonce}`;
  }
}

export function MonitorTile({
  slotIndex,
  camera,
  streamMode,
  metrics,
  isSelectedSlot,
  isWallFullscreen,
  isFocusedCamera,
  subscribeFrame,
  onSelectSlot,
  onClearSlot,
  onReconnect,
  onFocusChange,
  onOpenPicker,
  onDirectStatusChange,
}: MonitorTileProps) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mjpegImgRef = useRef<HTMLImageElement | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  const singleFpsRef = useRef({ count: 0, windowStart: 0 });
  const nextNonceRef = useRef(0);
  const directErrorCountRef = useRef(0);

  const [hasFrame, setHasFrame] = useState(false);
  const [isTileFullscreen, setIsTileFullscreen] = useState(false);
  const [fitContain, setFitContain] = useState(true);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  const [directStatus, setDirectStatus] = useState<StreamStatus>("connecting");
  const [directFps, setDirectFps] = useState(0);
  const [useProxyFallback, setUseProxyFallback] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [activeBuf, setActiveBuf] = useState<0 | 1>(0);
  const [bufUrls, setBufUrls] = useState<[string | null, string | null]>([
    null,
    null,
  ]);
  const singleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveMode =
    !camera || streamMode === "idle"
      ? "idle"
      : streamMode === "websocket"
      ? "websocket"
      : useProxyFallback
      ? "proxy-snapshot"
      : streamMode;

  useEffect(() => {
    setUseProxyFallback(false);
    directErrorCountRef.current = 0;
  }, [camera?.id, camera?.url, streamMode]);

  useEffect(() => {
    setHasFrame(false);
    setDirectStatus("connecting");
    setDirectFps(0);
    lastBlobRef.current = null;
    singleFpsRef.current = { count: 0, windowStart: performance.now() };
  }, [camera?.id, camera?.url, streamMode, reloadNonce]);

  useEffect(() => {
    if (!camera) {
      onDirectStatusChange(slotIndex, "idle");
      return;
    }
    if (effectiveMode !== "websocket" && effectiveMode !== "idle") {
      onDirectStatusChange(slotIndex, directStatus);
    }
  }, [camera, effectiveMode, directStatus, slotIndex, onDirectStatusChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    if (!camera || effectiveMode !== "websocket") return;

    let cancelled = false;
    let busy = false;

    const unsubscribe = subscribeFrame(camera.id, async (blob) => {
      lastBlobRef.current = blob;
      if (busy || cancelled) return;
      busy = true;
      try {
        // Menggunakan createImageBitmap agar decoding JPEG berjalan di luar thread utama UI
        const bitmap = await createImageBitmap(blob);
        if (cancelled) {
          bitmap.close();
          return;
        }
        const targetCanvas = canvasRef.current;
        if (targetCanvas) {
          if (
            targetCanvas.width !== bitmap.width ||
            targetCanvas.height !== bitmap.height
          ) {
            targetCanvas.width = bitmap.width;
            targetCanvas.height = bitmap.height;
          }
          const ctx = targetCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(bitmap, 0, 0);
          }
        }
        bitmap.close();
        setHasFrame(true);
      } catch {
        // Abaikan frame yang korup saat transisi stream
      } finally {
        busy = false;
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [camera, effectiveMode, subscribeFrame]);

  // Mengosongkan src img MJPEG saat unmount agar koneksi HTTP/1.1 langsung terputus di browser
  useEffect(() => {
    if (!camera || effectiveMode !== "direct-mjpeg") return;
    const imgEl = mjpegImgRef.current;
    return () => {
      if (imgEl) {
        imgEl.src = "";
      }
    };
  }, [camera, effectiveMode, reloadNonce]);

  useEffect(() => {
    if (singleTimerRef.current) {
      clearTimeout(singleTimerRef.current);
      singleTimerRef.current = null;
    }

    if (
      !camera ||
      (effectiveMode !== "direct-single" && effectiveMode !== "proxy-snapshot")
    ) {
      setBufUrls([null, null]);
      return;
    }

    nextNonceRef.current += 1;
    const firstUrl =
      effectiveMode === "direct-single"
        ? buildDirectSingleUrl(camera.url, nextNonceRef.current)
        : `/api/snapshot/${encodeURIComponent(camera.id)}?_t=${Date.now()}_${nextNonceRef.current}`;

    setActiveBuf(0);
    setBufUrls([firstUrl, null]);

    return () => {
      if (singleTimerRef.current) {
        clearTimeout(singleTimerRef.current);
        singleTimerRef.current = null;
      }
    };
  }, [camera, effectiveMode, reloadNonce]);

  useEffect(() => {
    const handleFsChange = () => {
      const active = document.fullscreenElement === tileRef.current;
      setIsTileFullscreen(active);
      if (camera) {
        onFocusChange(active ? camera.id : null);
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
    };
  }, [camera, onFocusChange]);

  const scheduleNextSingleFrame = (loadedIndex: 0 | 1) => {
    if (!camera) return;
    directErrorCountRef.current = 0;
    setActiveBuf(loadedIndex);
    setHasFrame(true);
    setDirectStatus("live");

    const now = performance.now();
    const counter = singleFpsRef.current;
    counter.count += 1;
    const elapsed = now - counter.windowStart;
    if (elapsed >= 1000) {
      setDirectFps(Math.max(1, Math.round((counter.count * 1000) / elapsed)));
      counter.count = 0;
      counter.windowStart = now;
    }

    const nextBufferIndex: 0 | 1 = loadedIndex === 0 ? 1 : 0;
    const delayMs =
      effectiveMode === "direct-single"
        ? isFocusedCamera
          ? 70
          : 140
        : isFocusedCamera
        ? 150
        : 300;

    if (singleTimerRef.current) clearTimeout(singleTimerRef.current);
    singleTimerRef.current = setTimeout(() => {
      nextNonceRef.current += 1;
      const nextUrl =
        effectiveMode === "direct-single"
          ? buildDirectSingleUrl(camera.url, nextNonceRef.current)
          : `/api/snapshot/${encodeURIComponent(camera.id)}?_t=${Date.now()}_${nextNonceRef.current}`;
      setBufUrls((prev) =>
        nextBufferIndex === 0 ? [nextUrl, prev[1]] : [prev[0], nextUrl]
      );
    }, delayMs);
  };

  const handleSingleBufferError = (failedIndex: 0 | 1) => {
    if (!camera) return;
    directErrorCountRef.current += 1;
    if (effectiveMode === "direct-single") {
      if (directErrorCountRef.current >= 4) {
        setUseProxyFallback(true);
        return;
      }
      if (singleTimerRef.current) clearTimeout(singleTimerRef.current);
      singleTimerRef.current = setTimeout(() => {
        nextNonceRef.current += 1;
        const retryUrl = buildDirectSingleUrl(camera.url, nextNonceRef.current);
        setBufUrls((prev) =>
          failedIndex === 0 ? [retryUrl, prev[1]] : [prev[0], retryUrl]
        );
      }, 500);
      return;
    }
    setDirectStatus("error");
    if (singleTimerRef.current) clearTimeout(singleTimerRef.current);
    singleTimerRef.current = setTimeout(() => {
      nextNonceRef.current += 1;
      const retryUrl = `/api/snapshot/${encodeURIComponent(camera.id)}?_t=${Date.now()}_${nextNonceRef.current}`;
      setBufUrls((prev) =>
        failedIndex === 0 ? [retryUrl, prev[1]] : [prev[0], retryUrl]
      );
    }, 2000);
  };

  const toggleTileFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tileRef.current) return;
    try {
      if (document.fullscreenElement === tileRef.current) {
        await document.exitFullscreen();
      } else {
        await tileRef.current.requestFullscreen();
      }
    } catch {
      // Abaikan jika browser menolak permintaan layar penuh
    }
  };

  const handleSaveSnapshot = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!camera) return;

    let blobToSave = lastBlobRef.current;
    if (!blobToSave) {
      setSavingSnapshot(true);
      try {
        const res = await fetch(
          `/api/snapshot/${encodeURIComponent(camera.id)}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          blobToSave = await res.blob();
        }
      } catch {
        blobToSave = null;
      } finally {
        setSavingSnapshot(false);
      }
    }

    if (!blobToSave) return;
    const url = URL.createObjectURL(blobToSave);
    const anchor = document.createElement("a");
    anchor.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.download = `cctv-${camera.id}-${timestamp}.jpg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleTileReconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!camera) return;
    if (effectiveMode === "websocket") {
      onReconnect(camera.id);
      return;
    }
    setReloadNonce((n) => n + 1);
  };

  if (!camera) {
    return (
      <div
        onClick={() => onOpenPicker(slotIndex)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenPicker(slotIndex);
          }
        }}
        className={`group flex h-full min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border transition-colors lg:min-h-0 ${
          isSelectedSlot
            ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-slot-selected)]"
            : "border-[var(--md-sys-color-outline-variant)] border-dashed bg-[var(--md-sys-color-surface-container-lowest)] hover:border-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container-low)]"
        } m3-elevation-1 p-4 text-center`}
      >
        <div
          className={`mb-2.5 flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
            isSelectedSlot
              ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
              : "bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] group-hover:bg-[var(--md-sys-color-primary)] group-hover:text-[var(--md-sys-color-on-primary)]"
          }`}
        >
          <Plus className="h-5 w-5" />
        </div>
        <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
          Monitor {slotIndex + 1} Kosong
        </span>
        <span className="mt-1 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          Klik untuk memilih kamera CCTV secara manual
        </span>
      </div>
    );
  }

  const status =
    effectiveMode === "websocket"
      ? metrics?.status ?? "connecting"
      : effectiveMode === "idle"
      ? "connecting"
      : directStatus;

  const fps =
    effectiveMode === "websocket"
      ? metrics?.fps ?? 0
      : effectiveMode === "direct-mjpeg"
      ? 0
      : directFps;

  const statusDotClass =
    status === "live"
      ? "bg-[#4ADE80]"
      : status === "error"
      ? "bg-[#F87171]"
      : "bg-[#FBBF24]";

  const statusText =
    status === "live"
      ? fps > 0
        ? `Live ${fps} FPS`
        : "Live"
      : status === "error"
      ? "Terputus"
      : "Menghubungkan";

  return (
    <div
      ref={tileRef}
      onClick={() => onSelectSlot(slotIndex)}
      className={`group relative flex h-full min-h-[220px] items-center justify-center overflow-hidden rounded-2xl border bg-[var(--md-sys-color-video-bg)] transition-colors lg:min-h-0 ${
        isTileFullscreen
          ? "rounded-none border-none"
          : isSelectedSlot
          ? "border-2 border-[var(--md-sys-color-primary)]"
          : "border-[var(--md-sys-color-outline-variant)]"
      } m3-elevation-1`}
    >
      {effectiveMode === "websocket" && (
        <canvas
          ref={canvasRef}
          className={`h-full w-full ${
            fitContain ? "object-contain" : "object-cover"
          }`}
        />
      )}

      {effectiveMode === "direct-mjpeg" && (
        <img
          ref={mjpegImgRef}
          key={`${camera.id}-${reloadNonce}`}
          src={reloadNonce > 0 ? `${camera.url}&_r=${reloadNonce}` : camera.url}
          alt={camera.nama}
          onLoad={() => {
            directErrorCountRef.current = 0;
            setHasFrame(true);
            setDirectStatus("live");
          }}
          onError={() => {
            directErrorCountRef.current += 1;
            if (directErrorCountRef.current <= 2) {
              if (singleTimerRef.current) clearTimeout(singleTimerRef.current);
              singleTimerRef.current = setTimeout(() => {
                setReloadNonce((n) => n + 1);
              }, 1200);
              return;
            }
            setUseProxyFallback(true);
          }}
          className={`h-full w-full ${
            fitContain ? "object-contain" : "object-cover"
          }`}
        />
      )}

      {(effectiveMode === "direct-single" ||
        effectiveMode === "proxy-snapshot") && (
        <>
          {bufUrls[0] && (
            <img
              src={bufUrls[0]}
              alt={camera.nama}
              onLoad={() => scheduleNextSingleFrame(0)}
              onError={() => handleSingleBufferError(0)}
              className={`absolute inset-0 h-full w-full ${
                fitContain ? "object-contain" : "object-cover"
              } ${activeBuf === 0 ? "z-[1] opacity-100" : "z-0 opacity-0"}`}
            />
          )}
          {bufUrls[1] && (
            <img
              src={bufUrls[1]}
              alt={camera.nama}
              onLoad={() => scheduleNextSingleFrame(1)}
              onError={() => handleSingleBufferError(1)}
              className={`absolute inset-0 h-full w-full ${
                fitContain ? "object-contain" : "object-cover"
              } ${activeBuf === 1 ? "z-[1] opacity-100" : "z-0 opacity-0"}`}
            />
          )}
        </>
      )}

      {!hasFrame && (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-[var(--md-sys-color-video-bg)] px-4 text-center text-white">
          {status === "error" ? (
            <>
              <VideoOff className="h-8 w-8 text-[#F87171]" />
              <p className="text-xs font-medium text-[#E2E8F0]">
                Gagal memuat video kamera
              </p>
              <button
                type="button"
                onClick={handleTileReconnect}
                className="mt-1 rounded-full bg-[var(--md-sys-color-primary)] px-3 py-1 text-xs font-medium text-[var(--md-sys-color-on-primary)] hover:bg-[var(--md-sys-color-primary-hover)]"
              >
                Coba Lagi
              </button>
            </>
          ) : (
            <>
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--md-sys-color-primary-container)] border-t-[var(--md-sys-color-primary)]" />
              <p className="text-xs text-[#CBD5E1]">
                Menghubungkan ke kamera...
              </p>
            </>
          )}
        </div>
      )}

      <div
        className={`pointer-events-none absolute inset-x-2 top-2 z-10 flex items-center justify-between gap-2 ${
          isWallFullscreen && !isTileFullscreen ? "inset-x-1.5 top-1.5" : ""
        }`}
      >
        <div
          title={`${camera.nama} (${camera.kategori})`}
          className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-full bg-[#1A1C1E]/75 py-1 pr-2.5 pl-1.5 text-white backdrop-blur-xs"
        >
          <span
            className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
              isSelectedSlot
                ? "bg-[#1565C0] text-white"
                : "bg-white/20 text-white"
            }`}
          >
            {slotIndex + 1}
          </span>
          <span className="truncate text-xs font-medium">{camera.nama}</span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
            {statusText}
          </span>
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-full bg-[#1A1C1E]/75 p-1 text-white backdrop-blur-xs">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPicker(slotIndex);
            }}
            title="Ganti kamera pada monitor ini"
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/90 hover:bg-white/20 hover:text-white"
          >
            <Replace className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleSaveSnapshot}
            disabled={!hasFrame || savingSnapshot}
            title="Simpan gambar saat ini"
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/90 hover:bg-white/20 hover:text-white disabled:opacity-40"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleTileReconnect}
            title="Muat ulang stream kamera"
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/90 hover:bg-white/20 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={toggleTileFullscreen}
            title={
              isTileFullscreen
                ? "Keluar Full Screen Kamera"
                : "Full Screen Kamera"
            }
            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1565C0] text-white hover:bg-[#0D47A1]"
          >
            {isTileFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>

          {!isTileFullscreen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearSlot(slotIndex);
              }}
              title="Tutup kamera dari monitor ini"
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/90 hover:bg-[#BA1A1A] hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {hasFrame && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFitContain((v) => !v);
          }}
          className="absolute right-2 bottom-2 z-10 rounded-full bg-[#1A1C1E]/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs hover:bg-[#1A1C1E]"
        >
          {fitContain ? "Penuhi Layar" : "Aspek Asli"}
        </button>
      )}
    </div>
  );
}
