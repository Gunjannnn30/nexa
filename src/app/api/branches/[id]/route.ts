import { NextResponse, type NextRequest } from "next/server";
import { handleApi, requireUser } from "@/server/http";
import { deleteBranch } from "@/server/services/branches";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    await deleteBranch(user.id, id);
    return NextResponse.json({ ok: true });
  });
}
