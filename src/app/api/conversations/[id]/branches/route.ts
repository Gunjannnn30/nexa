import { NextResponse, type NextRequest } from "next/server";
import { createBranchSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import { createBranch, listBranches } from "@/server/services/branches";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    return NextResponse.json({ branches: await listBranches(user.id, id) });
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const input = await parseBody(req, createBranchSchema);
    const branch = await createBranch(user.id, id, input.messageId, {
      title: input.title,
      memberIds: input.memberIds,
    });
    return NextResponse.json(branch, { status: branch.existed ? 200 : 201 });
  });
}
