import { NextResponse, type NextRequest } from "next/server";
import { addContactSchema, createReportSchema } from "@/lib/schemas";
import { handleApi, parseBody, requireUser } from "@/server/http";
import {
  addContact,
  blockUser,
  listBlockedUsers,
  listContacts,
  removeContact,
  reportUser,
  searchUsers,
  unblockUser,
} from "@/server/services/users";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const type = req.nextUrl.searchParams.get("type");
    if (type === "search") {
      const q = req.nextUrl.searchParams.get("q") ?? "";
      return NextResponse.json({ users: await searchUsers(user.id, q) });
    }
    if (type === "blocks") {
      return NextResponse.json({ blocks: await listBlockedUsers(user.id) });
    }
    return NextResponse.json({ contacts: await listContacts(user.id) });
  });
}

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const action = req.nextUrl.searchParams.get("action");
    if (action === "report") {
      const input = await parseBody(req, createReportSchema);
      const report = await reportUser(user.id, input.reportedId, input.reason, input.details);
      return NextResponse.json({ report }, { status: 201 });
    }
    if (action === "block") {
      const body = (await req.json()) as { userId?: string };
      if (!body.userId) {
        return NextResponse.json(
          { error: { code: "BAD_REQUEST", message: "userId is required." } },
          { status: 400 },
        );
      }
      await blockUser(user.id, body.userId);
      return NextResponse.json({ ok: true });
    }
    const input = await parseBody(req, addContactSchema);
    const contact = await addContact(user.id, input.identifier, input.nickname);
    return NextResponse.json({ contact }, { status: 201 });
  });
}

export async function DELETE(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const id = req.nextUrl.searchParams.get("id");
    const blockId = req.nextUrl.searchParams.get("blockUserId");
    if (blockId) {
      await unblockUser(user.id, blockId);
      return NextResponse.json({ ok: true });
    }
    if (!id) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "id is required." } },
        { status: 400 },
      );
    }
    await removeContact(user.id, id);
    return NextResponse.json({ ok: true });
  });
}
