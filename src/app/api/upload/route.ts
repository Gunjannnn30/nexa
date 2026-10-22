import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { enforceRate, handleApi, requireUser } from "@/server/http";
import { uploadAttachment } from "@/server/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handleApi(async () => {
    const user = await requireUser(req);
    enforceRate(`upload:${user.id}`, 30, 60 * 1000);
    const form = await req.formData().catch(() => null);
    if (!form) throw new AppError(400, "INVALID_UPLOAD", "Upload must be multipart form data.");
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError(400, "INVALID_UPLOAD", "Choose a file to upload.");
    }
    const width = Number(form.get("width"));
    const height = Number(form.get("height"));
    const durationMs = Number(form.get("durationMs"));
    const attachment = await uploadAttachment(user.id, file, {
      width: Number.isFinite(width) && width > 0 ? Math.round(width) : undefined,
      height: Number.isFinite(height) && height > 0 ? Math.round(height) : undefined,
      audioDurationMs:
        Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : undefined,
    });
    return NextResponse.json(
      {
        attachment: {
          id: attachment.id,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          kind: attachment.kind,
          width: attachment.width,
          height: attachment.height,
          durationMs: attachment.durationMs,
          url: `/api/attachments/${attachment.id}`,
        },
      },
      { status: 201 },
    );
  });
}
