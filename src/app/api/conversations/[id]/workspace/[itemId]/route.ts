import { NextResponse, type NextRequest } from "next/server";
import { updateWorkspaceItemSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import { deleteWorkspaceItem, updateWorkspaceItem } from "@/server/services/workspace";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id, itemId } = await params;
    const input = await parseBody(req, updateWorkspaceItemSchema);
    return NextResponse.json({ item: await updateWorkspaceItem(user.id, id, itemId, input) });
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id, itemId } = await params;
    await deleteWorkspaceItem(user.id, id, itemId);
    return NextResponse.json({ ok: true });
  });
}
