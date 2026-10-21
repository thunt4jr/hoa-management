import { NextResponse, type NextRequest } from "next/server";
import { classifyHost } from "./src/server/hosts";
export function proxy(req: NextRequest) {
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
