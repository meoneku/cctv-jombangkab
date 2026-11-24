import { httpsGetBuffer } from "@/lib/cctvCa";
import type { CamerasResponse, CctvCamera } from "@/types/cctv";

const SOURCE_URL = "https://cctv.jombangkab.go.id/v2/";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const FALLBACK_TTL_MS = 30 * 60 * 1000;

interface CachedCameras extends CamerasResponse {
  refreshAtMs: number;
}

let cachedPayload: CachedCameras | null = null;
let inFlightFetch: Promise<CachedCameras> | null = null;

// Mengambil waktu kedaluwarsa (ms) dari token JWT ZoneMinder tanpa memverifikasi signature
function extractJwtExpiryMs(streamUrl: string): number | null {
  try {
    const parsed = new URL(streamUrl);
    const token = parsed.searchParams.get("token");
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const claims = JSON.parse(json) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Mengekstrak array JSON cctvData dari skrip inline HTML sumber
function parseCamerasFromHtml(html: string): CctvCamera[] {
  const marker = "const cctvData = ";
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) {
    throw new Error("Data kamera tidak ditemukan pada halaman sumber");
  }
  const arrayStart = html.indexOf("[", startIdx + marker.length);
  const arrayEnd = html.indexOf("];", arrayStart);
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error("Format array cctvData tidak valid");
  }
  const rawList = JSON.parse(html.slice(arrayStart, arrayEnd + 1)) as Array<
    Record<string, unknown>
  >;

  return rawList.map((item) => {
    const rawUrl = String(item.url || "");
    let monitorId = "";
    try {
      monitorId = new URL(rawUrl).searchParams.get("monitor") || "";
    } catch {
      monitorId = "";
    }
    return {
      id: String(item.id),
      monitorId,
      nama: String(item.nama || "").trim(),
      lat: Number(item.lat) || 0,
      lng: Number(item.lng) || 0,
      kategori: String(item.kategori || "Lainnya").trim(),
      status: String(item.status || "online").trim(),
      url: rawUrl,
    };
  });
}

export async function getCamerasPayload(
  forceRefresh = false
): Promise<CamerasResponse> {
  const now = Date.now();
  if (!forceRefresh && cachedPayload && now < cachedPayload.refreshAtMs) {
    return {
      ...cachedPayload,
      wsSupported: process.env.WS_STREAM_SUPPORTED === "1",
    };
  }

  if (inFlightFetch) {
    const result = await inFlightFetch;
    return {
      ...result,
      wsSupported: process.env.WS_STREAM_SUPPORTED === "1",
    };
  }

  inFlightFetch = (async () => {
    try {
      const { statusCode, body } = await httpsGetBuffer(SOURCE_URL, 15000);
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`HTTP ${statusCode} dari server sumber`);
      }

      const html = body.toString("utf8");
      const cameras = parseCamerasFromHtml(html);

      let earliestExpMs: number | null = null;
      for (const cam of cameras) {
        const expMs = extractJwtExpiryMs(cam.url);
        if (expMs && (!earliestExpMs || expMs < earliestExpMs)) {
          earliestExpMs = expMs;
        }
      }

      const fetchedAtMs = Date.now();
      const refreshAtMs = earliestExpMs
        ? Math.max(fetchedAtMs + 60000, earliestExpMs - REFRESH_MARGIN_MS)
        : fetchedAtMs + FALLBACK_TTL_MS;

      const categories = [...new Set(cameras.map((c) => c.kategori))];

      cachedPayload = {
        wsSupported: process.env.WS_STREAM_SUPPORTED === "1",
        updatedAt: new Date(fetchedAtMs).toISOString(),
        tokenExpiresAt: earliestExpMs
          ? new Date(earliestExpMs).toISOString()
          : null,
        refreshAtMs,
        total: cameras.length,
        categories,
        cameras,
      };

      return cachedPayload;
    } catch (error) {
      if (cachedPayload) {
        return cachedPayload;
      }
      throw error;
    } finally {
      inFlightFetch = null;
    }
  })();

  const result = await inFlightFetch;
  return {
    ...result,
    wsSupported: process.env.WS_STREAM_SUPPORTED === "1",
  };
}

export async function getCameraById(
  cameraId: string,
  forceRefresh = false
): Promise<CctvCamera | null> {
  const payload = await getCamerasPayload(forceRefresh);
  return payload.cameras.find((c) => c.id === String(cameraId)) || null;
}

export async function fetchSingleCameraFrame(
  cameraId: string
): Promise<Buffer | null> {
  let camera = await getCameraById(cameraId, false);
  if (!camera || !camera.url) return null;

  const tryFetch = async (streamUrl: string) => {
    const urlObj = new URL(streamUrl);
    urlObj.searchParams.set("mode", "single");
    return httpsGetBuffer(urlObj.toString(), 8000);
  };

  let res = await tryFetch(camera.url);
  if (res.statusCode === 401 || res.statusCode === 403 || res.body.length < 100) {
    camera = await getCameraById(cameraId, true);
    if (!camera || !camera.url) return null;
    res = await tryFetch(camera.url);
  }

  if (
    res.statusCode >= 200 &&
    res.statusCode < 300 &&
    res.contentType.includes("image/jpeg") &&
    res.body.length > 0
  ) {
    return res.body;
  }

  return null;
}
