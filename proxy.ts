import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "./src/server/hosts";
import { ensureRuntimeSecret } from "./src/server/runtime";
export async function proxy(req: NextRequest) {
  try {
    await ensureRuntimeSecret();
  } catch (error: unknown) {
    const runtimeEnv = globalThis["process"]["env"];
    console.error(
      JSON.stringify({
        event: "runtime_secret_unavailable",
        code:
          error instanceof Error && /^[A-Za-z0-9_]{1,80}$/.test(error.name)
            ? error.name
            : "UnknownError",
        credentialSources: {
          environment: Boolean(
            runtimeEnv["AWS_ACCESS_KEY_ID"] &&
            runtimeEnv["AWS_SECRET_ACCESS_KEY"],
          ),
          container: Boolean(
            runtimeEnv["AWS_CONTAINER_CREDENTIALS_FULL_URI"] ||
            runtimeEnv["AWS_CONTAINER_CREDENTIALS_RELATIVE_URI"],
          ),
          webIdentity: Boolean(runtimeEnv["AWS_WEB_IDENTITY_TOKEN_FILE"]),
          lambda: Boolean(runtimeEnv["AWS_LAMBDA_FUNCTION_NAME"]),
        },
      }),
    );
    return new NextResponse(
      "Service is temporarily unavailable. Please retry.",
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "5" },
      },
    );
  }
  try {
    classifyHost(req.headers.get("host") || undefined);
  } catch {
    return new NextResponse(
      "Hostname not recognized or secure platform configuration is missing.",
      { status: 421, headers: { "Cache-Control": "no-store" } },
    );
  }
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Content-Security-Policy",
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}
