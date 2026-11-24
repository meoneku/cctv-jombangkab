import { NextResponse } from "next/server";
import { fetchSingleCameraFrame } from "@/lib/cctvSource";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const frame = await fetchSingleCameraFrame(id);
    if (!frame) {
      return NextResponse.json(
        { error: "Snapshot kamera tidak tersedia" },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(frame), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Length": String(frame.length),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal mengambil gambar kamera",
      },
      { status: 500 }
    );
  }
}
