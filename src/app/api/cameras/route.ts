import { NextRequest, NextResponse } from "next/server";
import { getCamerasPayload } from "@/lib/cctvSource";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "sin1";

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const payload = await getCamerasPayload(forceRefresh);
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal memuat daftar kamera",
      },
      { status: 500 }
    );
  }
}
