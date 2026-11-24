"use client";

import { useMemo, useState } from "react";
import {
  Check,
  RefreshCw,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { CctvCamera, MonitorSlot } from "@/types/cctv";

interface CameraSidebarProps {
  open: boolean;
  cameras: CctvCamera[];
  categories: string[];
  slots: MonitorSlot[];
  selectedSlot: number;
  loading: boolean;
  refreshing: boolean;
  onCloseMobile: () => void;
  onAssignCamera: (cameraId: string) => void;
  onClearAll: () => void;
  onRefreshSource: () => void;
}

export function CameraSidebar({
  open,
  cameras,
  categories,
  slots,
  selectedSlot,
  loading,
  refreshing,
  onCloseMobile,
  onAssignCamera,
  onClearAll,
  onRefreshSource,
}: CameraSidebarProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Semua");

  const slotMap = useMemo(() => {
    const map = new Map<string, number[]>();
    slots.forEach((slot) => {
      if (!slot.cameraId) return;
      const list = map.get(slot.cameraId) ?? [];
      list.push(slot.slotIndex + 1);
      map.set(slot.cameraId, list);
    });
    return map;
  }, [slots]);

  const filteredCameras = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cameras.filter((cam) => {
      const matchCat =
        activeCategory === "Semua" || cam.kategori === activeCategory;
      const matchSearch =
        !query ||
        cam.nama.toLowerCase().includes(query) ||
        cam.kategori.toLowerCase().includes(query);
      return matchCat && matchSearch;
    });
  }, [cameras, activeCategory, search]);

  const assignedCount = slots.filter((s) => s.cameraId !== null).length;

  if (!open) return null;

  return (
    <>
      <div
        onClick={onCloseMobile}
        className="fixed inset-0 z-20 bg-black/40 lg:hidden"
        aria-hidden="true"
      />
      <aside className="fixed inset-y-0 left-0 z-30 flex w-80 flex-col border-r border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] m3-elevation-2 lg:static lg:z-auto lg:w-[332px] lg:shrink-0">
        <div className="flex items-center justify-between border-b border-[var(--md-sys-color-divider)] px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
              Daftar Kamera CCTV
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Target:{" "}
              <span className="font-semibold text-[var(--md-sys-color-primary)]">
                Monitor {selectedSlot + 1}
              </span>{" "}
              ({cameras.length} lokasi)
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefreshSource}
              disabled={refreshing}
              title="Perbarui data dan token dari server sumber"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              title="Tutup panel kamera"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)] lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-2.5 border-b border-[var(--md-sys-color-divider)] bg-[var(--md-sys-color-surface-container-low)] p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--md-sys-color-on-surface-variant)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama jalan atau lokasi..."
              className="w-full rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] py-2 pr-8 pl-9 text-xs text-[var(--md-sys-color-on-surface)] placeholder-[var(--md-sys-color-outline)] focus:border-[var(--md-sys-color-primary)] focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {["Semua", ...categories].map((cat) => {
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]"
                      : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container)]"
                  }`}
                >
                  {active && <Check className="h-3 w-3" />}
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              Klik kamera untuk isi ke Monitor {selectedSlot + 1}
            </span>
            <button
              type="button"
              onClick={onClearAll}
              disabled={assignedCount === 0}
              title="Kosongkan semua monitor"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] px-2.5 py-1 text-xs font-medium text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)] disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Kosongkan
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-[var(--md-sys-color-on-surface-variant)]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--md-sys-color-primary-container)] border-t-[var(--md-sys-color-primary)]" />
              <span>Memuat daftar kamera CCTV...</span>
            </div>
          ) : filteredCameras.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">
              Tidak ada kamera yang cocok dengan pencarian.
            </div>
          ) : (
            <ul className="space-y-1">
              {filteredCameras.map((cam) => {
                const assignedSlots = slotMap.get(cam.id);
                const isAssigned = Boolean(
                  assignedSlots && assignedSlots.length > 0
                );
                return (
                  <li key={cam.id}>
                    <button
                      type="button"
                      onClick={() => onAssignCamera(cam.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        isAssigned
                          ? "bg-[var(--md-sys-color-slot-selected)] text-[var(--md-sys-color-on-primary-container)]"
                          : "hover:bg-[var(--md-sys-color-surface-container-low)]"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            isAssigned
                              ? "bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
                              : "bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]"
                          }`}
                        >
                          <Video className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-[var(--md-sys-color-on-surface)]">
                            {cam.nama}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--md-sys-color-success)]" />
                            <span className="truncate">{cam.kategori}</span>
                          </div>
                        </div>
                      </div>

                      {isAssigned && assignedSlots && (
                        <span className="shrink-0 rounded-full bg-[var(--md-sys-color-primary)] px-2 py-0.5 text-[10px] font-bold text-[var(--md-sys-color-on-primary)]">
                          M{assignedSlots.join(",")}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
