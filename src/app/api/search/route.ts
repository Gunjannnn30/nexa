import { NextResponse, type NextRequest } from "next/server";
import { enforceRate, handleApi, requireUser } from "@/server/http";
import { searchMessages, semanticSearch } from "@/server/services/search";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`search:${user.id}`, 45, 60 * 1000);
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (!q) return NextResponse.json({ results: [], mode: "lexical", notice: null });
    const conversationId = req.nextUrl.searchParams.get("conversationId") ?? undefined;
    const semantic = req.nextUrl.searchParams.get("semantic") === "true";
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
    if (semantic) {
      return NextResponse.json(await semanticSearch(user.id, { q, conversationId, limit }));
    }
    const results = await searchMessages(user.id, { q, conversationId, limit });
    return NextResponse.json({ results, mode: "lexical", notice: null });
  });
}
