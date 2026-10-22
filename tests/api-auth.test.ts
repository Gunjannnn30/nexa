import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as healthGET } from "@/app/api/health/route";
import { GET as searchGET } from "@/app/api/search/route";
import { POST as uploadPOST } from "@/app/api/upload/route";
import { GET as attachmentGET } from "@/app/api/attachments/[id]/route";
import { createSession } from "@/server/session";
import { deleteStorageObject, uploadAttachment } from "@/server/storage";
import { createTestUser, resetDatabase } from "./helpers";

function request(url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return new NextRequest(url, init);
}

function withSession(token: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) {
  return {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), cookie: `nexa_session=${token}` },
  };
}

describe("HTTP authorization boundaries", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("exposes a public health check without leaking configuration", async () => {
    const response = await healthGET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", database: "ok" });
    expect(typeof body.ai.configured).toBe("boolean");
    expect(JSON.stringify(body)).not.toMatch(/api[_-]?key|secret|token|password/i);
  });

  it("rejects unauthenticated API requests with 401", async () => {
    const response = await searchGET(request("http://localhost:3000/api/search?q=secret"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("accepts a valid session cookie", async () => {
    const user = await createTestUser("api");
    const { token } = await createSession(user.id);
    const response = await searchGET(
      request("http://localhost:3000/api/search?q=anything", withSession(token)),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ mode: "lexical", results: [] });
  });

  it("rejects cross-origin state-changing requests", async () => {
    const response = await uploadPOST(
      request("http://localhost:3000/api/upload", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatchObject({ code: "CSRF_REJECTED" });
  });

  it("keeps unattached uploads private to the uploader", async () => {
    const owner = await createTestUser("owner");
    const stranger = await createTestUser("stranger");
    const { token: ownerToken } = await createSession(owner.id);
    const { token: strangerToken } = await createSession(stranger.id);
    const attachment = await uploadAttachment(
      owner.id,
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "p.png", {
        type: "image/png",
      }),
    );

    const strangerResponse = await attachmentGET(
      request(`http://localhost:3000/api/attachments/${attachment.id}`, withSession(strangerToken)),
      { params: Promise.resolve({ id: attachment.id }) },
    );
    expect(strangerResponse.status).toBe(404);

    const ownerResponse = await attachmentGET(
      request(`http://localhost:3000/api/attachments/${attachment.id}`, withSession(ownerToken)),
      { params: Promise.resolve({ id: attachment.id }) },
    );
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.headers.get("content-type")).toBe("image/png");

    await deleteStorageObject(attachment.storageKey);
  });
});
