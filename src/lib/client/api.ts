export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json().catch(() => null)) as unknown)
    : null;
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? `Request failed (${response.status}).`,
      error?.details,
    );
  }
  return payload as T;
}

export function apiGet<T>(path: string) {
  return api<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown) {
  return api<T>(path, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export function apiPatch<T>(path: string, body: unknown) {
  return api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string) {
  return api<T>(path, { method: "DELETE" });
}

export async function uploadFile(
  file: File,
  meta: { width?: number; height?: number; durationMs?: number } = {},
) {
  const form = new FormData();
  form.append("file", file);
  if (meta.width) form.append("width", String(meta.width));
  if (meta.height) form.append("height", String(meta.height));
  if (meta.durationMs) form.append("durationMs", String(meta.durationMs));
  return api<{ attachment: import("./types").Attachment }>("/api/upload", {
    method: "POST",
    body: form,
  });
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const details = error.details as { retryAfter?: number } | undefined;
    if (error.code === "RATE_LIMITED" && details?.retryAfter) {
      return `Slow down a little — try again in ${details.retryAfter}s.`;
    }
    if (error.code === "AI_UNAVAILABLE") {
      const missing = (error.details as { missing?: string[] } | undefined)?.missing ?? [];
      return missing.length
        ? `AI is not configured. Add ${missing.join(", ")} to your environment.`
        : error.message;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
