import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type {
  NextApiHandler,
  NextApiRequest,
  GetServerSidePropsContext,
} from "next";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { config } from "./config";
import { requirePlatform } from "./hosts";

export function noStore(res: ServerResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Vary", "Cookie, Host");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
}
export function api(
  methods: string[],
  handler: NextApiHandler,
): NextApiHandler {
  return async (req, res) => {
    const requestId = randomUUID();
    noStore(res);
    res.setHeader("X-Request-ID", requestId);
    try {
      requirePlatform(req.headers.host);
      if (!methods.includes(req.method || "")) {
        res.setHeader("Allow", methods.join(", "));
        throw new AppError(
          405,
          "method_not_allowed",
          "This method is not supported.",
        );
      }
      if (!["GET", "HEAD"].includes(req.method!)) {
        if (
          req.headers.origin !== config().origin.origin ||
          !req.headers["content-type"]?.startsWith("application/json")
        )
          throw new AppError(
            403,
            "csrf",
            "Use the platform form to submit this request.",
          );
      }
      await handler(req, res);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: {
            code: "validation",
            message: "Check the submitted fields.",
            fields: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
          requestId,
        });
        return;
      }
      if (error instanceof AppError) {
        res.status(error.status).json({
          error: { code: error.code, message: error.message },
          requestId,
        });
        return;
      }
      const code = (error as { code?: string }).code;
      if (["22023", "23505", "23514"].includes(code || "")) {
        res.status(409).json({
          error: {
            code: "conflict",
            message:
              "This change conflicts with the current record. Refresh and check the review or address details.",
          },
          requestId,
        });
        return;
      }
      // Never log request bodies, tokens, SQL text, addresses, or provider errors.
      console.error(
        JSON.stringify({
          level: "error",
          event: "request.failed",
          requestId,
          category: code || "internal",
        }),
      );
      res.status(503).json({
        error: {
          code: "unavailable",
          message:
            "This action is unavailable. Check service configuration or try again later.",
        },
        requestId,
      });
    }
  };
}
export const bodyLimit = { api: { bodyParser: { sizeLimit: "32kb" } } };
export function platformPage(ctx: GetServerSidePropsContext) {
  noStore(ctx.res);
  requirePlatform(ctx.req.headers.host);
}
export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
export function queryId(req: NextApiRequest, key: string) {
  const id = req.query[key];
  if (typeof id !== "string")
    throw new AppError(400, "invalid_id", "A single identifier is required.");
  return id;
}
