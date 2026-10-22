import { NextResponse, type NextRequest } from "next/server";
import { handleApi, requireUser } from "@/server/http";
import { listStarredMessages } from "@/server/services/messages";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    return NextResponse.json({ items: await listStarredMessages(user.id) });
  });
}
