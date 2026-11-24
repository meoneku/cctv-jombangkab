import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { getCameraById, getCamerasPayload } from "./src/server/cctvSource.mjs";
import { MjpegMultiplexer } from "./src/server/mjpegMultiplexer.mjs";

const dev = !process.argv.includes("--prod") && process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const multiplexer = new MjpegMultiplexer();

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

app.prepare().then(() => {
  const upgradeHandler = app.getUpgradeHandler();
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    multiplexer.registerClient(ws);
  });

  const server = createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const { pathname, searchParams } = reqUrl;

      if (pathname === "/api/cameras" && req.method === "GET") {
        const forceRefresh = searchParams.get("refresh") === "1";
        const payload = await getCamerasPayload(forceRefresh);
        return sendJson(res, 200, payload);
      }

      if (pathname.startsWith("/api/snapshot/") && req.method === "GET") {
        const cameraId = pathname.slice("/api/snapshot/".length);
        const frame = await multiplexer.getSnapshot(cameraId);
        if (!frame) {
          return sendJson(res, 404, { error: "Snapshot kamera tidak tersedia" });
        }
        res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store",
          "Content-Length": frame.length,
        });
        return res.end(frame);
      }

      if (pathname.startsWith("/api/stream/") && req.method === "GET") {
        const cameraId = pathname.slice("/api/stream/".length);
        const camera = await getCameraById(cameraId);
        if (!camera || !camera.url) {
          return sendJson(res, 404, { error: "Kamera tidak ditemukan" });
        }

        const upstreamController = new AbortController();
        req.on("close", () => upstreamController.abort());

        const upstream = await fetch(camera.url, { signal: upstreamController.signal });
        if (!upstream.ok || !upstream.body) {
          return sendJson(res, 502, { error: "Gagal terhubung ke stream sumber" });
        }

        res.writeHead(200, {
          "Content-Type": upstream.headers.get("content-type") || "multipart/x-mixed-replace; boundary=ZoneMinderFrame",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        });

        const reader = upstream.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done || res.destroyed) break;
          res.write(Buffer.from(value));
        }
        return res.end();
      }

      return handle(req, res);
    } catch (err) {
      if (!res.headersSent) {
        return sendJson(res, 500, {
          error: err?.message || "Terjadi kesalahan pada server",
        });
      }
      res.end();
    }
  });

  // Memisahkan upgrade WebSocket /ws/streams agar tidak mengganggu HMR Next.js
  server.on("upgrade", (req, socket, head) => {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (reqUrl.pathname === "/ws/streams") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return;
    }
    upgradeHandler(req, socket, head);
  });

  server.listen(port, hostname, () => {
    console.log(`Server CCTV Jombang berjalan di http://localhost:${port}`);
  });
});
