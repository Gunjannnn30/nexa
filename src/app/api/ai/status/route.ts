import { NextResponse, type NextRequest } from "next/server";
import { handleApi, requireUser } from "@/server/http";
import { aiStatus } from "@/server/ai/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    await requireUser(req);
    return NextResponse.json({ ai: aiStatus() });
  });
}
