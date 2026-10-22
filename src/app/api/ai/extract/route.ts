import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { extractWorkspaceSchema, transcribeSchema } from "@/lib/schemas";
import { AppError } from "@/lib/errors";
import { enforceRate, handleApi, parseBody, requireUser } from "@/server/http";
import { extractWorkspaceItems, transcribeAttachment } from "@/server/services/ai";
import { createFromExtraction } from "@/server/services/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

const backfillSchema = z.object({ conversationId: z.string().min(1) });

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const action = req.nextUrl.searchParams.get("action") ?? "extract";
    if (action === "transcribe") {
      enforceRate(`ai:transcribe:${user.id}`, 8, 60 * 1000);
      const input = await parseBody(req, transcribeSchema);
      return NextResponse.json(
        await transcribeAttachment(user.id, input.attachmentId, input.translateTo),
      );
    }
    if (action === "backfill") {
      enforceRate(`ai:backfill:${user.id}`, 4, 60 * 1000);
      const input = await parseBody(req, backfillSchema);
      const { backfillEmbeddings } = await import("@/server/services/ai");
      return NextResponse.json(await backfillEmbeddings(user.id, input.conversationId));
    }
    if (action === "extract") {
      enforceRate(`ai:extract:${user.id}`, 15, 60 * 1000);
      const conversationId = req.nextUrl.searchParams.get("conversationId");
      if (!conversationId) throw new AppError(400, "BAD_REQUEST", "conversationId is required.");
      const input = await parseBody(req, extractWorkspaceSchema);
      if (!input.useAI) {
        const items = await createFromExtraction(
          user.id,
          conversationId,
          input.messageIds.map((id, index) => ({
            type: input.type,
            title: `${input.type === "TASK" ? "Task" : "Item"} from message ${index + 1}`,
            sourceMessageId: id,
          })),
        );
        return NextResponse.json({ items, provider: "none", model: "manual" });
      }
      const extraction = await extractWorkspaceItems(
        user.id,
        conversationId,
        input.messageIds,
        input.type,
      );
      const created = await createFromExtraction(user.id, conversationId, extraction.items);
      return NextResponse.json({
        items: created,
        provider: extraction.provider,
        model: extraction.model,
      });
    }
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Unknown AI action." } },
      { status: 404 },
    );
  });
}
