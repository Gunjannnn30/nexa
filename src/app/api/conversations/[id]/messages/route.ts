import { NextResponse, after, type NextRequest } from "next/server";
import { sendMessageSchema } from "@/lib/schemas";
import { handleApi, enforceRate, parseBody, requireUser } from "@/server/http";
import {
  assertAiConfigured,
  generateAiReply,
  isAiConversation,
} from "@/server/services/ai-assistant";
import {
  listMessages,
  listMessagesAround,
  sendMessage,
} from "@/server/services/messages";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const focus = req.nextUrl.searchParams.get("focus");
    if (focus) {
      const around = await listMessagesAround(user.id, id, focus);
      return NextResponse.json(around);
    }
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 40);
    const page = await listMessages(user.id, id, {
      cursor,
      limit: Number.isFinite(limit) ? limit : 40,
    });
    return NextResponse.json(page);
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`send:${user.id}`, 80, 60 * 1000);
    const { id } = await params;
    const input = await parseBody(req, sendMessageSchema);
    const isAi = await isAiConversation(user.id, id);
    if (isAi) {
      // Reject before persisting anything when the provider is not configured,
      // so the user never sees a message that can never be answered.
      assertAiConfigured();
      enforceRate(`ai:send:${user.id}`, 20, 5 * 60_000);
    }
    const message = await sendMessage(user.id, id, input);
    if (isAi) {
      after(() => generateAiReply(user.id, id, message.id));
    }
    return NextResponse.json({ message }, { status: 201 });
  });
}
