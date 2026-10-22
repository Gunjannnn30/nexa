import { NextResponse, type NextRequest } from "next/server";
import { handleApi, requireUser } from "@/server/http";
import { getPublicProfile } from "@/server/services/users";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { username } = await params;
    return NextResponse.json({ profile: await getPublicProfile(user.id, username.toLowerCase()) });
  });
}
