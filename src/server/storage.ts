import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { AppError, badRequest } from "@/lib/errors";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { safeFilename } from "@/lib/utils";

const MIME_EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
  "video/quicktime": ["mov"],
  "audio/webm": ["webm"],
  "audio/ogg": ["ogg", "oga"],
  "audio/mpeg": ["mp3"],
  "audio/mp4": ["m4a"],
  "audio/wav": ["wav"],
  "application/pdf": ["pdf"],
  "text/plain": ["txt", "log"],
  "text/csv": ["csv"],
  "text/markdown": ["md"],
  "application/json": ["json"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/zip": ["zip"],
};

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

let s3: S3Client | null = null;

function localRoot() {
  return path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);
}

function isS3Storage() {
  return env.STORAGE_DRIVER === "s3";
}

function s3Client() {
  if (!env.S3_BUCKET) {
    throw new AppError(503, "STORAGE_UNAVAILABLE", "Object storage is selected but S3_BUCKET is not set.");
  }
  s3 ??= new S3Client({
    region: env.S3_REGION || "us-east-1",
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? true,
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  return s3;
}

function kindFor(mime: string): "IMAGE" | "VIDEO" | "AUDIO" | "FILE" {
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  return "FILE";
}

function matchesSignature(mime: string, bytes: Uint8Array): boolean {
  const startsWith = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  const ascii = (start: number, length: number) =>
    Buffer.from(bytes.slice(start, start + length)).toString("ascii");
  if (mime === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (mime === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47);
  if (mime === "image/gif") return ascii(0, 3) === "GIF";
  if (mime === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
  if (mime === "application/pdf") return ascii(0, 4) === "%PDF";
  if (mime === "video/mp4" || mime === "audio/mp4" || mime === "video/quicktime") {
    return ascii(4, 4) === "ftyp";
  }
  if (mime === "video/webm" || mime === "audio/webm") return startsWith(0x1a, 0x45, 0xdf, 0xa3);
  if (mime === "audio/ogg") return ascii(0, 4) === "OggS";
  if (mime === "audio/wav") return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
  if (mime === "audio/mpeg") return ascii(0, 3) === "ID3" || startsWith(0xff, 0xfb) || startsWith(0xff, 0xf3);
  if (
    mime === "application/zip" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return startsWith(0x50, 0x4b);
  }
  return true; // text formats
}

export const MAX_UPLOAD_BYTES = env.MAX_UPLOAD_MB * 1024 * 1024;

export async function uploadAttachment(
  userId: string,
  file: File,
  options: { audioDurationMs?: number; width?: number; height?: number } = {},
) {
  if (!file || typeof file === "string") throw badRequest("Choose a file to upload.");
  if (file.size <= 0) throw badRequest("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError(413, "FILE_TOO_LARGE", `Files must be smaller than ${env.MAX_UPLOAD_MB} MB.`);
  }
  const originalName = safeFilename(path.basename(file.name || "file"));
  const extension = originalName.includes(".") ? originalName.split(".").pop()!.toLowerCase() : "";
  const mimeType = (file.type || "application/octet-stream").toLowerCase();
  const allowedExtensions = MIME_EXTENSIONS[mimeType];
  if (!allowedExtensions) {
    throw badRequest(
      "That file type is not supported. Upload images, video, audio, PDFs, text, or Office documents.",
    );
  }
  if (extension && !allowedExtensions.includes(extension)) {
    throw badRequest("The file extension does not match its declared type.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError(413, "FILE_TOO_LARGE", `Files must be smaller than ${env.MAX_UPLOAD_MB} MB.`);
  }
  if (!matchesSignature(mimeType, buffer)) {
    throw badRequest("The file contents do not match the declared file type.");
  }

  const safeExtension = allowedExtensions[0];
  const storageKey = `${userId}/${Date.now()}-${randomUUID()}.${safeExtension}`;
  if (isS3Storage()) {
    await s3Client().send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET!,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.byteLength,
      }),
    );
  } else {
    const destination = path.join(localRoot(), storageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
  }

  return prisma.attachment.create({
    data: {
      storageKey,
      originalName,
      mimeType,
      size: buffer.byteLength,
      kind: kindFor(mimeType),
      uploaderId: userId,
      durationMs: options.audioDurationMs ?? null,
      width: options.width ?? null,
      height: options.height ?? null,
    },
  });
}

export type UploadStream = {
  stream: Readable;
  contentLength: number;
  contentType: string;
  acceptRanges: boolean;
};

export async function getAttachmentStream(
  storageKey: string,
  range?: { start: number; end: number } | null,
): Promise<UploadStream> {
  if (isS3Storage()) {
    const response = await s3Client().send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET!,
        Key: storageKey,
        ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
      }),
    );
    if (!response.Body) throw new AppError(404, "NOT_FOUND", "File not found.");
    const body = response.Body as Readable;
    return {
      stream: body,
      contentLength: range
        ? range.end - range.start + 1
        : Number(response.ContentLength ?? 0),
      contentType: response.ContentType ?? "application/octet-stream",
      acceptRanges: true,
    };
  }

  const filePath = path.join(localRoot(), storageKey);
  let info;
  try {
    info = await stat(filePath);
  } catch {
    throw new AppError(404, "NOT_FOUND", "File not found.");
  }
  if (!info.isFile()) throw new AppError(404, "NOT_FOUND", "File not found.");
  const start = range?.start ?? 0;
  const end = range?.end ?? info.size - 1;
  return {
    stream: createReadStream(filePath, { start, end }),
    contentLength: end - start + 1,
    contentType: "application/octet-stream",
    acceptRanges: true,
  };
}

export async function getLocalFileSize(storageKey: string) {
  if (isS3Storage()) return null;
  try {
    const info = await stat(path.join(localRoot(), storageKey));
    return info.size;
  } catch {
    return null;
  }
}

export async function deleteStorageObject(storageKey: string) {
  try {
    if (isS3Storage()) {
      await s3Client().send(
        new DeleteObjectCommand({ Bucket: env.S3_BUCKET!, Key: storageKey }),
      );
    } else {
      await unlink(path.join(localRoot(), storageKey));
    }
  } catch (error) {
    console.warn("[nexa:storage] could not delete", storageKey, error);
  }
}

export function isImageType(mimeType: string) {
  return IMAGE_TYPES.has(mimeType);
}

export async function readAttachmentForAi(storageKey: string, limit = 20 * 1024 * 1024) {
  if (isS3Storage()) return null;
  const info = await stat(path.join(localRoot(), storageKey)).catch(() => null);
  if (!info || info.size > limit) return null;
  const chunks: Buffer[] = [];
  const data = await readFile(path.join(localRoot(), storageKey));
  chunks.push(data);
  return Buffer.concat(chunks);
}

export async function readAttachmentBuffer(storageKey: string, limit = 30 * 1024 * 1024) {
  const { stream, contentLength } = await getAttachmentStream(storageKey);
  if (contentLength > limit) throw new AppError(413, "FILE_TOO_LARGE", "File is too large for AI processing.");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) throw new AppError(413, "FILE_TOO_LARGE", "File is too large for AI processing.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export async function duplicateStorageObject(sourceKey: string, destinationKey: string) {
  if (isS3Storage()) {
    await s3Client().send(
      new CopyObjectCommand({
        Bucket: env.S3_BUCKET!,
        CopySource: `${env.S3_BUCKET}/${sourceKey}`,
        Key: destinationKey,
      }),
    );
    return;
  }
  const source = path.join(localRoot(), sourceKey);
  const destination = path.join(localRoot(), destinationKey);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

export function streamToWeb(stream: Readable): ReadableStream {
  return Readable.toWeb(stream) as ReadableStream;
}
