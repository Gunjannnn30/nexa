import { NextResponse, type NextRequest } from "next/server";
import { deleteAccountSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import {
  deleteAccount,
  exportAccount,
} from "@/server/services/users";
import { SESSION_COOKIE } from "@/server/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const data = await exportAccount(user.id);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="nexa-export-${user.username}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
}

export async function DELETE(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const input = await parseBody(req, deleteAccountSchema);
    await deleteAccount(user.id, input.password);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  });
}
