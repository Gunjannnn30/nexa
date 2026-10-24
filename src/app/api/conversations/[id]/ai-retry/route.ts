import { NextResponse, after, type NextRequest } from "next/server";
import { enforceRate, handleApi, requireUser } from "@/server/http";
import {
  assertAiRetryable,
  generateAiReply,
} from "@/server/services/ai-assistant";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`ai:retry:${user.id}`, 10, 5 * 60_000);
    const { id } = await params;
    const sourceMessageId = await assertAiRetryable(user.id, id);
    after(() => generateAiReply(user.id, id, sourceMessageId));
    return NextResponse.json({ queued: true }, { status: 202 });
  });
}
