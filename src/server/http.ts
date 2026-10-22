import { NextResponse, type NextRequest } from "next/server";
import { z, ZodError, type ZodTypeAny } from "zod";
import { AppError, rateLimited } from "@/lib/errors";
import { env } from "@/lib/env";
import { requireRequestUser } from "@/server/auth";
import { rateLimit } from "@/server/rate-limit";
import type { SessionUser } from "@/server/session";

export function jsonError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details ?? null } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Some fields need attention.",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 422 },
    );
  }
  console.error("[nexa:api]", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side." } },
    { status: 500 },
  );
}

export async function handleApi(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    return jsonError(error);
  }
}

function trustedOrigins(req: NextRequest) {
  const origins = new Set<string>();
  try {
    origins.add(new URL(env.APP_URL).origin);
  } catch {
    /* ignore */
  }
  origins.add(req.nextUrl.origin);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  if (host) origins.add(`${proto}://${host}`);
  return origins;
}

/** SameSite=lax cookies plus an origin check on state-changing requests. */
export function assertTrustedOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser client; session cookie still required
  if (!trustedOrigins(req).has(origin)) {
    throw new AppError(403, "CSRF_REJECTED", "Request origin is not allowed.");
  }
}

export async function requireUser(req: NextRequest): Promise<SessionUser> {
  assertTrustedOrigin(req);
  return requireRequestUser(req);
}

export function enforceRate(key: string, limit: number, windowMs: number) {
  const result = rateLimit(key, limit, windowMs);
  if (!result.ok) {
    const error = rateLimited();
    error.details = { retryAfter: result.retryAfter };
    throw error;
  }
}

export async function parseBody<S extends ZodTypeAny>(
  req: NextRequest,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

export function clientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 60);
  return req.headers.get("x-real-ip")?.slice(0, 60) ?? "local";
}
