import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createPollVoteSchema, reactionSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser, enforceRate } from "@/server/http";
import {
  addContextCard,
  forwardMessage,
  removeContextCard,
  toggleBookmark,
  togglePin,
  toggleReaction,
  votePoll,
} from "@/server/services/messages";

export const runtime = "nodejs";

const contextCardBody = z.object({
  type: z.enum(["TASK", "DATE", "DECISION", "FILE", "LINK"]),
  title: z.string().trim().min(1).max(200),
  data: z.record(z.string(), z.unknown()).optional(),
});

const forwardBody = z.object({
  conversationIds: z.array(z.string().min(1)).min(1).max(5),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id, action } = await params;

    if (action === "reaction") {
      const input = await parseBody(req, reactionSchema);
      return NextResponse.json({ reactions: await toggleReaction(user.id, id, input.emoji) });
    }
    if (action === "bookmark") {
      return NextResponse.json(await toggleBookmark(user.id, id));
    }
    if (action === "pin") {
      return NextResponse.json(await togglePin(user.id, id));
    }
    if (action === "vote") {
      const input = await parseBody(req, createPollVoteSchema);
      return NextResponse.json({ poll: await votePoll(user.id, id, input.optionIds) });
    }
    if (action === "forward") {
      enforceRate(`forward:${user.id}`, 20, 60 * 1000);
      const input = await parseBody(req, forwardBody);
      return NextResponse.json({ messages: await forwardMessage(user.id, id, input.conversationIds) });
    }
    if (action === "context-cards") {
      const input = await parseBody(req, contextCardBody);
      return NextResponse.json({ card: await addContextCard(user.id, id, input) }, { status: 201 });
    }
    if (action === "delete-context-card") {
      const body = (await req.json()) as { cardId?: string };
      if (!body.cardId) {
        return NextResponse.json(
          { error: { code: "BAD_REQUEST", message: "cardId is required." } },
          { status: 400 },
        );
      }
      await removeContextCard(user.id, id, body.cardId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Unknown message action." } },
      { status: 404 },
    );
  });
}
