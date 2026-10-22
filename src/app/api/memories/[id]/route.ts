import { NextResponse, type NextRequest } from "next/server";
import { updateMemorySchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import { deleteMemory, updateMemory } from "@/server/services/memories";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const input = await parseBody(req, updateMemorySchema);
    return NextResponse.json({ memory: await updateMemory(user.id, id, input) });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    await deleteMemory(user.id, id);
    return NextResponse.json({ ok: true });
  });
}
