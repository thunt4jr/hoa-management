import { AppError } from "./errors";

export function config() {
  const origin = new URL(
    process.env.PLATFORM_ORIGIN || "http://localhost:3000",
  );
  const production = process.env.NODE_ENV === "production";
  if (
    production &&
    (origin.protocol !== "https:" || !process.env.SESSION_SECRET)
  ) {
    throw new AppError(
      503,
      "configuration",
      "Secure platform configuration is required.",
    );
  }
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new AppError(503, "configuration", "Invalid platform origin.");
  }
  const secret =
    process.env.SESSION_SECRET ||
    (!production ? "local-development-only-secret-do-not-deploy" : "");
  if (secret.length < 32)
    throw new AppError(
      503,
      "configuration",
      "Session secret must contain at least 32 characters.",
    );
  const devAuth =
    process.env.AUTH_MODE === "development" &&
    process.env.ALLOW_DEV_AUTH === "true";
  if (
    devAuth &&
    (production || !["localhost", "127.0.0.1"].includes(origin.hostname))
  ) {
    throw new AppError(
      503,
      "configuration",
      "Development identity is only available on local development servers.",
    );
  }
  return {
    origin,
    production,
    secret,
    devAuth,
    baseDomain: process.env.COMMUNITY_BASE_DOMAIN || origin.hostname,
  };
}
