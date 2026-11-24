const SOURCE_URL = "https://cctv.jombangkab.go.id/v2";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const FALLBACK_TTL_MS = 30 * 60 * 1000;

let cachedPayload = null;
let inFlightFetch = null;

// Mengambil waktu kedaluwarsa (ms) dari token JWT ZoneMinder tanpa memverifikasi signature
function extractJwtExpiryMs(streamUrl) {
  try {
    const parsed = new URL(streamUrl);
    const token = parsed.searchParams.get("token");
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const claims = JSON.parse(json);
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

// Mengekstrak array JSON cctvData dari skrip inline HTML sumber
function parseCamerasFromHtml(html) {
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
  const rawList = JSON.parse(html.slice(arrayStart, arrayEnd + 1));
  return rawList.map((item) => {
    let monitorId = "";
    try {
      monitorId = new URL(item.url).searchParams.get("monitor") || "";
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
      url: String(item.url || ""),
    };
  });
}

export async function getCamerasPayload(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedPayload &&
    now < cachedPayload.refreshAtMs
  ) {
    return cachedPayload;
  }

  if (inFlightFetch) {
    return inFlightFetch;
  }

  inFlightFetch = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(SOURCE_URL, {
        signal: controller.signal,
        headers: {
          "User-Agent": "JombangCCTV-MultiMonitor/1.0",
          Accept: "text/html",
        },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} dari server sumber`);
      }

      const html = await response.text();
      const cameras = parseCamerasFromHtml(html);

      let earliestExpMs = null;
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
        wsSupported: true,
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

  return inFlightFetch;
}

export async function getCameraById(cameraId, forceRefresh = false) {
  const payload = await getCamerasPayload(forceRefresh);
  return payload.cameras.find((c) => c.id === String(cameraId)) || null;
}
