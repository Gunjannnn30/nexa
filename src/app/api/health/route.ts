import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAiConfig } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json(
      { status: "unavailable", database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const ai = getAiConfig();
  return NextResponse.json(
    {
      status: "ok",
      database: "ok",
      ai: { configured: ai.configured, provider: ai.provider, model: ai.model },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
