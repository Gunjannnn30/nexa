import { NextResponse, type NextRequest } from "next/server";
import { updateConversationSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import {
  deleteConversation,
  getConversationDTO,
  updateConversation,
} from "@/server/services/conversations";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    return NextResponse.json({ conversation: await getConversationDTO(user.id, id) });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const input = await parseBody(req, updateConversationSchema);
    return NextResponse.json({
      conversation: await updateConversation(user.id, id, input),
    });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    await deleteConversation(user.id, id);
    return NextResponse.json({ ok: true });
  });
}
