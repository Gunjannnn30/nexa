import { NextResponse, type NextRequest } from "next/server";
import { changePasswordSchema } from "@/lib/schemas";
import { AppError } from "@/lib/errors";
import { handleApi, parseBody, requireUser } from "@/server/http";
import { changePassword } from "@/server/services/users";
import { SESSION_COOKIE } from "@/server/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    try {
      const user = await requireUser(req);
      const input = await parseBody(req, changePasswordSchema);
      await changePassword(user.id, input.currentPassword, input.newPassword);
      const response = NextResponse.json({
        ok: true,
        message: "Password changed. Sign in again with your new password.",
      });
      response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
      return response;
    } catch (error) {
      if (error instanceof AppError && error.status === 400) throw error;
      throw error;
    }
  });
}
