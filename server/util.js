/** Small shared helpers: ids, the error envelope, validation. */
import { randomBytes } from "node:crypto";

export const nowIso = () => new Date().toISOString();

export function id(prefix, bytes = 6) {
  return `${prefix}_${randomBytes(bytes).toString("hex")}`;
}

export class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message) => new ApiError(400, "invalid_request", message);
export const forbidden = (message = "Forbidden") => new ApiError(403, "forbidden", message);
export const notFound = (message = "Not found") => new ApiError(404, "not_found", message);
export const tooLarge = (message) => new ApiError(413, "payload_too_large", message);
export const unprocessable = (message) => new ApiError(422, "unprocessable", message);
export const tooMany = (message, retryAfter = 60) =>
  new ApiError(429, "rate_limited", message, { "retry-after": String(retryAfter) });
export const notImplemented = (message) => new ApiError(501, "not_configured", message);

export const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function assertString(value, field, { min = 1, max = 10_000, required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw badRequest(`${field} is required`);
    return "";
  }
  if (typeof value !== "string") throw badRequest(`${field} must be a string`);
  const trimmed = value.trim();
  if (required && trimmed.length < min)
    throw badRequest(`${field} must be at least ${min} character${min === 1 ? "" : "s"}`);
  if (trimmed.length > max) throw badRequest(`${field} must be at most ${max} characters`);
  return trimmed;
}

export function assertNumber(value, field, { min = -Infinity, max = Infinity, required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw badRequest(`${field} is required`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw badRequest(`${field} must be a number`);
  if (number < min) throw badRequest(`${field} must be at least ${min}`);
  if (number > max) throw badRequest(`${field} must be at most ${max}`);
  return Math.round(number);
}

export function assertBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  return /^(1|true|yes|on)$/i.test(String(value));
}

export function isValidEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.trim())
  );
}

export function stopwatch() {
  const started = performance.now();
  return () => Math.max(0, Math.round(performance.now() - started));
}

export const truncate = (text, max) =>
  String(text ?? "").length <= max ? String(text ?? "") : `${String(text ?? "").slice(0, Math.max(0, max - 1))}…`;

export const errorBody = (code, message) => ({ error: { code, message } });
