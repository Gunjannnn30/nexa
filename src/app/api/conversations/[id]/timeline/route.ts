import { NextResponse, type NextRequest } from "next/server";
import { handleApi, requireUser } from "@/server/http";
import { conversationTimeline } from "@/server/services/workspace";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    return NextResponse.json(await conversationTimeline(user.id, id));
  });
}
