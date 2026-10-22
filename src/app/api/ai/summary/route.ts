import { NextResponse, type NextRequest } from "next/server";
import { aiSummarySchema } from "@/lib/schemas";
import { enforceRate, handleApi, parseBody, requireUser } from "@/server/http";
import { summarizeConversation } from "@/server/services/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`ai:summary:${user.id}`, 10, 60 * 1000);
    const input = await parseBody(req, aiSummarySchema);
    return NextResponse.json(await summarizeConversation(user.id, input));
  });
}
