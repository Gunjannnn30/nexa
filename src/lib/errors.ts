export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "You must be signed in.") =>
  new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this resource.") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found.") => new AppError(404, "NOT_FOUND", message);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, "CONFLICT", message, details);
export const rateLimited = (message = "Too many requests. Please slow down.") =>
  new AppError(429, "RATE_LIMITED", message);
export const aiUnavailable = (message: string, missing: string[]) =>
  new AppError(503, "AI_UNAVAILABLE", message, { missing });
