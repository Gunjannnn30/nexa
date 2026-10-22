import { NextResponse, type NextRequest } from "next/server";
import { updateProfileSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import { updateProfile } from "@/server/services/users";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const input = await parseBody(req, updateProfileSchema);
    const updated = await updateProfile(user.id, input);
    return NextResponse.json({ user: updated });
  });
}
