import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  deleteStorageObject,
  readAttachmentBuffer,
  uploadAttachment,
} from "@/server/storage";
import { createTestUser, prisma, resetDatabase } from "./helpers";

const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("uploads", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await rm(path.resolve(process.cwd(), "./storage/test-uploads"), {
      recursive: true,
      force: true,
    });
  });

  it("stores an allowed image and returns a private attachment record", async () => {
    const user = await createTestUser("upload");
    const file = new File([PNG_HEADER], "pixel.png", { type: "image/png" });

    const attachment = await uploadAttachment(user.id, file);
    expect(attachment).toMatchObject({
      originalName: "pixel.png",
      mimeType: "image/png",
      kind: "IMAGE",
      uploaderId: user.id,
      messageId: null,
    });
    expect(attachment.storageKey.startsWith(user.id)).toBe(true);

    const bytes = await readAttachmentBuffer(attachment.storageKey);
    expect([...bytes]).toEqual([...PNG_HEADER]);

    await deleteStorageObject(attachment.storageKey);
  });

  it("rejects contents that do not match the declared MIME type", async () => {
    const user = await createTestUser("upload");
    const file = new File([new TextEncoder().encode("<script>alert(1)</script>")], "fake.png", {
      type: "image/png",
    });

    await expect(uploadAttachment(user.id, file)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("contents do not match"),
    });
    expect(await prisma.attachment.count()).toBe(0);
  });

  it("rejects unknown MIME types and mismatched extensions", async () => {
    const user = await createTestUser("upload");
    const executable = new File([new Uint8Array([0x4d, 0x5a])], "tool.exe", {
      type: "application/x-msdownload",
    });
    await expect(uploadAttachment(user.id, executable)).rejects.toMatchObject({ status: 400 });

    const disguised = new File([PNG_HEADER], "pixel.exe", { type: "image/png" });
    await expect(uploadAttachment(user.id, disguised)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("extension"),
    });
  });

  it("rejects empty files", async () => {
    const user = await createTestUser("upload");
    const file = new File([], "empty.txt", { type: "text/plain" });
    await expect(uploadAttachment(user.id, file)).rejects.toMatchObject({ status: 400 });
  });
});
