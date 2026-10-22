import { NextResponse, type NextRequest } from "next/server";
import { createConversationSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import { createConversation, listConversations } from "@/server/services/conversations";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const filter = req.nextUrl.searchParams.get("filter") ?? "all";
    const query = req.nextUrl.searchParams.get("q") ?? undefined;
    const conversations = await listConversations(user.id, { filter, query });
    return NextResponse.json({ conversations });
  });
}

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const input = await parseBody(req, createConversationSchema);
    const conversation = await createConversation(user.id, input);
    return NextResponse.json({ conversation }, { status: 201 });
  });
}
