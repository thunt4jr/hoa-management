import { config } from "./config";
import { AppError } from "./errors";

export const reservedSlugs = new Set([
  "www",
  "app",
  "api",
  "admin",
  "auth",
  "login",
  "signup",
  "register",
  "support",
  "mail",
  "status",
  "billing",
  "assets",
  "static",
  "cdn",
  "portfolio",
]);
export function validSlug(value: string) {
  return (
    /^[a-z][a-z0-9-]{2,47}$/.test(value) &&
    !value.endsWith("-") &&
    !reservedSlugs.has(value)
  );
}

export function classifyHost(raw: string | undefined) {
  const { origin, baseDomain } = config();
  if (!raw || /[\s/@\\,#?]/.test(raw))
    throw new AppError(421, "unknown_host", "This hostname is not recognized.");
  if (raw.toLowerCase() === origin.host.toLowerCase())
    return { kind: "platform" as const };
  // Only explicit default subdomains are supported. Forwarded host headers are never read.
  const host = raw.toLowerCase();
  const suffix = `.${baseDomain}${origin.port ? `:${origin.port}` : ""}`;
  const slug = host.endsWith(suffix) ? host.slice(0, -suffix.length) : "";
  if (!validSlug(slug))
    throw new AppError(421, "unknown_host", "This hostname is not recognized.");
  return { kind: "community" as const, slug };
}

export function requirePlatform(raw: string | undefined) {
  if (classifyHost(raw).kind !== "platform")
    throw new AppError(
      421,
      "platform_host_required",
      "Use the platform address for this action.",
    );
}

export function safeReturnPath(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\r\n]/.test(value) &&
    !/%(?:2f|5c|0d|0a)/i.test(value)
    ? value
    : "/app";
}
