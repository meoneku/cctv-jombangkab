"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Cctv,
  Clock,
  Laptop,
  Maximize,
  Minimize,
  Moon,
  PanelLeft,
  Radio,
  Sun,
} from "lucide-react";
import { CameraSidebar } from "@/components/CameraSidebar";
import { MonitorTile } from "@/components/MonitorTile";
import { useCctvStreams } from "@/hooks/useCctvStreams";
import type {
  CamerasResponse,
  CctvCamera,
  MonitorCount,
  MonitorSlot,
  ThemePreference,
} from "@/types/cctv";

const STORAGE_KEY_COUNT = "jombang_cctv_monitor_count_v2";
const STORAGE_KEY_SLOTS = "jombang_cctv_monitor_slots_v2";
const STORAGE_KEY_THEME = "jombang_cctv_theme_v1";
const MAX_MONITORS = 8;

function createInitialSlots(): MonitorSlot[] {
  return Array.from({ length: MAX_MONITORS }, (_, idx) => ({
    slotIndex: idx,
    cameraId: null,
  }));
}

function applyDocumentTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", pref);
  }
}

export function MonitorWorkspace() {
  const wallRef = useRef<HTMLDivElement | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cameras, setCameras] = useState<CctvCamera[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [wsSupported, setWsSupported] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [monitorCount, setMonitorCount] = useState<MonitorCount>(4);
  const [slots, setSlots] = useState<MonitorSlot[]>(createInitialSlots);
  const [selectedSlot, setSelectedSlot] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [isWallFullscreen, setIsWallFullscreen] = useState(false);
  const [showFloatingBar, setShowFloatingBar] = useState(true);
  const [clockText, setClockText] = useState("");
  const [themePref, setThemePref] = useState<ThemePreference>("system");
  const [systemDark, setSystemDark] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);
    const onMediaChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };
    media.addEventListener("change", onMediaChange);

    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
      if (
        savedTheme === "system" ||
        savedTheme === "light" ||
        savedTheme === "dark"
      ) {
        setThemePref(savedTheme);
        applyDocumentTheme(savedTheme);
      } else {
        applyDocumentTheme("system");
      }

      const savedCount = Number(localStorage.getItem(STORAGE_KEY_COUNT));
      if (savedCount === 4 || savedCount === 6 || savedCount === 8) {
        setMonitorCount(savedCount);
      }

      const savedSlotsRaw = localStorage.getItem(STORAGE_KEY_SLOTS);
      if (savedSlotsRaw) {
        const parsed = JSON.parse(savedSlotsRaw) as (string | null)[];
        if (Array.isArray(parsed) && parsed.length === MAX_MONITORS) {
          setSlots(
            parsed.map((cameraId, slotIndex) => ({
              slotIndex,
              cameraId: cameraId ? String(cameraId) : null,
            }))
          );
        }
      }

      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    } catch {
      // Gunakan konfigurasi bawaan jika localStorage tidak tersedia
    }
    setHydrated(true);

    return () => {
      media.removeEventListener("change", onMediaChange);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyDocumentTheme(themePref);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, themePref);
      localStorage.setItem(STORAGE_KEY_COUNT, String(monitorCount));
      localStorage.setItem(
        STORAGE_KEY_SLOTS,
        JSON.stringify(slots.map((s) => s.cameraId))
      );
    } catch {
      // Abaikan kegagalan penyimpanan lokal
    }
  }, [themePref, monitorCount, slots, hydrated]);

  useEffect(() => {
    const updateClock = () => {
      setClockText(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchCameras = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const endpoint = forceRefresh
        ? "/api/cameras?refresh=1"
        : "/api/cameras";
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Gagal memuat data kamera (${res.status})`);
      }
      const data = (await res.json()) as CamerasResponse;
      setCameras(data.cameras);
      setCategories(data.categories);
      setWsSupported(Boolean(data.wsSupported));
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Gagal terhubung ke server CCTV"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (hydrated) {
      fetchCameras(false);
    }
  }, [hydrated, fetchCameras]);

  useEffect(() => {
    const handleFsChange = () => {
      const active = document.fullscreenElement === wallRef.current;
      setIsWallFullscreen(active);
      setShowFloatingBar(true);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
    };
  }, []);

  const handleWallPointerMove = () => {
    if (!isWallFullscreen) return;
    setShowFloatingBar(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setShowFloatingBar(false);
    }, 3000);
  };

  const toggleWallFullscreen = async () => {
    if (!wallRef.current) return;
    try {
      if (document.fullscreenElement === wallRef.current) {
        await document.exitFullscreen();
      } else {
        await wallRef.current.requestFullscreen();
      }
    } catch {
      // Abaikan jika browser membatasi mode layar penuh
    }
  };

  const visibleSlots = useMemo(
    () => slots.slice(0, monitorCount),
    [slots, monitorCount]
  );

  const cameraMap = useMemo(() => {
    const map = new Map<string, CctvCamera>();
    cameras.forEach((c) => map.set(c.id, c));
    return map;
  }, [cameras]);

  const activeCameraIds = useMemo(() => {
    const ids = visibleSlots
      .map((s) => s.cameraId)
      .filter((id): id is string => Boolean(id));
    return [...new Set(ids)];
  }, [visibleSlots]);

  const targetFps = monitorCount <= 4 ? 8 : 6;
  const { wsConnected, metrics, subscribeFrame, reconnectCamera } =
    useCctvStreams(activeCameraIds, focusId, targetFps, wsSupported);

  const handleChangeMonitorCount = (count: MonitorCount) => {
    setMonitorCount(count);
    if (selectedSlot >= count) {
      setSelectedSlot(count - 1);
    }
  };

  const handleAssignCamera = (cameraId: string) => {
    setSlots((prev) => {
      const next = [...prev];
      const targetIndex = selectedSlot < monitorCount ? selectedSlot : 0;
      next[targetIndex] = { ...next[targetIndex], cameraId };
      return next;
    });
    setSelectedSlot((prev) => {
      const nextSlot = prev + 1;
      return nextSlot < monitorCount ? nextSlot : 0;
    });
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const handleClearSlot = (slotIndex: number) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.slotIndex === slotIndex ? { ...s, cameraId: null } : s
      )
    );
    setSelectedSlot(slotIndex);
  };

  const handleClearAll = () => {
    setSlots(createInitialSlots());
    setSelectedSlot(0);
  };

  const handleOpenPicker = (slotIndex: number) => {
    setSelectedSlot(slotIndex);
    setSidebarOpen(true);
  };

  const cycleTheme = () => {
    setThemePref((prev) => {
      if (prev === "system") return "light";
      if (prev === "light") return "dark";
      return "system";
    });
  };

  const effectiveDark =
    themePref === "dark" || (themePref === "system" && systemDark);

  const themeLabel =
    themePref === "system"
      ? `Otomatis (${systemDark ? "Gelap" : "Terang"})`
      : themePref === "dark"
      ? "Mode Gelap"
      : "Mode Terang";

  const gridClass =
    monitorCount === 4
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 lg:grid-rows-2"
      : monitorCount === 6
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-2";

  const liveCount = activeCameraIds.filter(
    (id) => metrics[id]?.status === "live"
  ).length;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)]">
      <header className="z-20 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-3 sm:px-5 m3-elevation-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            title={
              sidebarOpen
                ? "Sembunyikan daftar kamera"
                : "Tampilkan daftar kamera"
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]"
          >
            <PanelLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]">
              <Cctv className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-[var(--md-sys-color-on-surface)] sm:text-base">
                Pantau CCTV Jombang
              </h1>
              <p className="hidden truncate text-xs text-[var(--md-sys-color-on-surface-variant)] sm:block">
                Dinding Multi-Monitor Langsung (4 hingga 8 Layar)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <div
            role="group"
            aria-label="Jumlah monitor bersamaan"
            className="inline-flex rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-0.5"
          >
            {([4, 6, 8] as MonitorCount[]).map((count) => {
              const active = monitorCount === count;
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => handleChangeMonitorCount(count)}
                  className={`rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                    active
                      ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                      : "text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]"
                  }`}
                >
                  {count} Monitor
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={cycleTheme}
            title={`Tema tampilan: ${themeLabel}. Klik untuk mengganti`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-2.5 py-1.5 text-xs font-medium text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] sm:px-3"
          >
            {themePref === "system" ? (
              <Laptop className="h-3.5 w-3.5 text-[var(--md-sys-color-primary)]" />
            ) : effectiveDark ? (
              <Moon className="h-3.5 w-3.5 text-[var(--md-sys-color-primary)]" />
            ) : (
              <Sun className="h-3.5 w-3.5 text-[var(--md-sys-color-primary)]" />
            )}
            <span className="hidden xl:inline">{themeLabel}</span>
          </button>

          <div className="hidden items-center gap-2 rounded-full border border-[var(--md-sys-color-divider)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)] md:flex">
            <Radio
              className={`h-3.5 w-3.5 ${
                wsConnected
                  ? "text-[var(--md-sys-color-success)]"
                  : "text-[var(--md-sys-color-warning)]"
              }`}
            />
            <span>
              {liveCount}/{activeCameraIds.length} Live
            </span>
            <span className="text-[var(--md-sys-color-outline-variant)]">|</span>
            <Clock className="h-3.5 w-3.5 text-[var(--md-sys-color-primary)]" />
            <span className="font-mono font-medium text-[var(--md-sys-color-on-surface)]">
              {clockText}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleWallFullscreen}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--md-sys-color-primary)] px-3.5 py-2 text-xs font-medium text-[var(--md-sys-color-on-primary)] hover:bg-[var(--md-sys-color-primary-hover)] m3-elevation-1 sm:px-4"
          >
            <Maximize className="h-4 w-4" />
            <span className="hidden sm:inline">Full Screen Semua</span>
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <CameraSidebar
          open={sidebarOpen}
          cameras={cameras}
          categories={categories}
          slots={visibleSlots}
          selectedSlot={selectedSlot}
          loading={loading}
          refreshing={refreshing}
          onCloseMobile={() => setSidebarOpen(false)}
          onAssignCamera={handleAssignCamera}
          onClearAll={handleClearAll}
          onRefreshSource={() => fetchCameras(true)}
        />

        <main
          ref={wallRef}
          onMouseMove={handleWallPointerMove}
          className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${
            isWallFullscreen
              ? "bg-[var(--md-sys-color-video-bg)] p-2"
              : "bg-[var(--md-sys-color-surface)] p-3"
          }`}
        >
          {loadError && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error-container)] px-4 py-2.5 text-xs text-[var(--md-sys-color-on-error-container)]">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{loadError}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchCameras(true)}
                className="rounded-full bg-[#BA1A1A] px-3 py-1 font-medium text-white hover:bg-[#93000A]"
              >
                Muat Ulang
              </button>
            </div>
          )}

          {isWallFullscreen && (
            <div
              className={`fixed top-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-4 py-1.5 transition-opacity duration-200 m3-elevation-2 ${
                showFloatingBar
                  ? "opacity-100"
                  : "pointer-events-none opacity-0"
              }`}
            >
              <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">
                CCTV Jombang ({liveCount}/{activeCameraIds.length} Live)
              </span>
              <div className="inline-flex rounded-full bg-[var(--md-sys-color-surface-container-low)] p-0.5">
                {([4, 6, 8] as MonitorCount[]).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => handleChangeMonitorCount(count)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      monitorCount === count
                        ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                        : "text-[var(--md-sys-color-on-surface-variant)]"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <span className="font-mono text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {clockText}
              </span>
              <button
                type="button"
                onClick={toggleWallFullscreen}
                className="inline-flex items-center gap-1 rounded-full bg-[#BA1A1A] px-3 py-1 text-xs font-medium text-white hover:bg-[#93000A]"
              >
                <Minimize className="h-3.5 w-3.5" />
                Keluar Full Screen
              </button>
            </div>
          )}

          <div
            className={`grid min-h-0 flex-1 gap-2.5 overflow-y-auto lg:overflow-hidden ${gridClass}`}
          >
            {visibleSlots.map((slot) => {
              const camera = slot.cameraId
                ? cameraMap.get(slot.cameraId) ?? null
                : null;
              return (
                <MonitorTile
                  key={slot.slotIndex}
                  slotIndex={slot.slotIndex}
                  camera={camera}
                  metrics={camera ? metrics[camera.id] : undefined}
                  isSelectedSlot={selectedSlot === slot.slotIndex}
                  isWallFullscreen={isWallFullscreen}
                  subscribeFrame={subscribeFrame}
                  onSelectSlot={setSelectedSlot}
                  onClearSlot={handleClearSlot}
                  onReconnect={reconnectCamera}
                  onFocusChange={setFocusId}
                  onOpenPicker={handleOpenPicker}
                />
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
