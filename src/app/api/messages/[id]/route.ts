import { NextResponse, type NextRequest } from "next/server";
import { editMessageSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import { deleteMessage, editMessage, getMessageDTO } from "@/server/services/messages";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    return NextResponse.json({ message: await getMessageDTO(id, user.id) });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const input = await parseBody(req, editMessageSchema);
    return NextResponse.json({ message: await editMessage(user.id, id, input.body) });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    await deleteMessage(user.id, id);
    return NextResponse.json({ ok: true });
  });
}
