import { NextResponse, type NextRequest } from "next/server";
import { handleApi, requireUser } from "@/server/http";
import { exportRoom } from "@/server/services/conversations";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const { filename, content } = await exportRoom(user.id, id);
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]+/g, "-")}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
