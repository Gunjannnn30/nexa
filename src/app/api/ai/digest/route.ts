import { NextResponse, type NextRequest } from "next/server";
import { aiDigestSchema } from "@/lib/schemas";
import { enforceRate, handleApi, parseBody, requireUser } from "@/server/http";
import { generateDigest } from "@/server/services/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`ai:digest:${user.id}`, 6, 60 * 1000);
    await parseBody(req, aiDigestSchema);
    return NextResponse.json(await generateDigest(user.id));
  });
}
