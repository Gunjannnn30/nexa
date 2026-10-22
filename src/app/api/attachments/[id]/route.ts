import { NextResponse, type NextRequest } from "next/server";
import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { handleApi, requireUser } from "@/server/http";
import { getAttachmentStream, streamToWeb } from "@/server/storage";

export const runtime = "nodejs";

const INLINE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "application/pdf",
]);

function parseRange(header: string | null, size: number) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const startRaw = match[1] ?? "";
  const endRaw = match[2] ?? "";
  if (!startRaw && !endRaw) return null;
  let start: number;
  let end: number;
  if (!startRaw) {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleApi(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: {
        message: {
          select: {
            deletedAt: true,
            conversation: {
              select: { members: { where: { userId: user.id }, select: { id: true } } },
            },
          },
        },
      },
    });
    if (!attachment) throw notFound("Attachment not found.");
    if (attachment.message) {
      if (attachment.message.deletedAt) throw notFound("Attachment not found.");
      if (!attachment.message.conversation.members.length) throw notFound("Attachment not found.");
    } else if (attachment.uploaderId !== user.id) {
      throw notFound("Attachment not found.");
    }

    const range = parseRange(req.headers.get("range"), attachment.size);
    const object = await getAttachmentStream(attachment.storageKey, range);
    const contentType =
      attachment.mimeType === "application/octet-stream" ? object.contentType : attachment.mimeType;
    const disposition = INLINE_TYPES.has(contentType) ? "inline" : "attachment";
    const encodedName = encodeURIComponent(attachment.originalName);
    const headers = new Headers({
      "Content-Type": contentType,
      "Content-Length": String(range ? range.end - range.start + 1 : attachment.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      Vary: "Cookie",
    });
    if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${attachment.size}`);
    return new NextResponse(streamToWeb(object.stream), {
      status: range ? 206 : 200,
      headers,
    });
  });
}
