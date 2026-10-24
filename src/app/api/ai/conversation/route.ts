import { NextResponse, type NextRequest } from "next/server";
import { enforceRate, handleApi, requireUser } from "@/server/http";
import { getOrCreateAiConversation } from "@/server/services/ai-assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`ai:conversation:${user.id}`, 10, 60_000);
    const conversation = await getOrCreateAiConversation(user.id);
    return NextResponse.json({ conversation });
  });
}
