import { NextResponse, type NextRequest } from "next/server";
import { updateSettingsSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import { getOwnProfile, updateSettings } from "@/server/services/users";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const profile = await getOwnProfile(user.id);
    return NextResponse.json({ settings: profile.settings });
  });
}

export async function PATCH(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const input = await parseBody(req, updateSettingsSchema);
    const settings = await updateSettings(user.id, input);
    return NextResponse.json({ settings });
  });
}
