import { NextResponse, type NextRequest } from "next/server";
import { aiAskSchema } from "@/lib/schemas";
import { enforceRate, handleApi, parseBody, requireUser } from "@/server/http";
import { askConversation } from "@/server/services/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`ai:ask:${user.id}`, 20, 60 * 1000);
    const input = await parseBody(req, aiAskSchema);
    return NextResponse.json(await askConversation(user.id, input));
  });
}
