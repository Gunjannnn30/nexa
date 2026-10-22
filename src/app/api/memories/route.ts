import { NextResponse, type NextRequest } from "next/server";
import { handleApi, requireUser } from "@/server/http";
import { createMemory, listMemories } from "@/server/services/memories";
import { createMemorySchema } from "@/lib/schemas";
import { parseBody } from "@/server/http";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    return NextResponse.json(await listMemories(user.id));
  });
}

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const input = await parseBody(req, createMemorySchema);
    return NextResponse.json({ memory: await createMemory(user.id, input) }, { status: 201 });
  });
}
