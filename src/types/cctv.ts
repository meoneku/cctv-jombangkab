export interface CctvCamera {
  id: string;
  monitorId: string;
  nama: string;
  lat: number;
  lng: number;
  kategori: string;
  status: string;
  url: string;
}

export interface CamerasResponse {
  wsSupported?: boolean;
  updatedAt: string;
  tokenExpiresAt: string | null;
  total: number;
  categories: string[];
  cameras: CctvCamera[];
}

export type StreamStatus = "idle" | "connecting" | "live" | "error";

export type MonitorCount = 4 | 6 | 8;

export type ThemePreference = "system" | "light" | "dark";

export interface MonitorSlot {
  slotIndex: number;
  cameraId: string | null;
}

export interface StreamMetrics {
  status: StreamStatus;
  fps: number;
  message?: string;
}
