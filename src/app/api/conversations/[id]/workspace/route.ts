import { NextResponse, type NextRequest } from "next/server";
import { createWorkspaceItemSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import { createWorkspaceItem, getWorkspace } from "@/server/services/workspace";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    return NextResponse.json({ workspace: await getWorkspace(user.id, id) });
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const input = await parseBody(req, createWorkspaceItemSchema);
    const item = await createWorkspaceItem(user.id, id, input);
    return NextResponse.json({ item }, { status: 201 });
  });
}
