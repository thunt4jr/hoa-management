import type { GetServerSidePropsContext } from "next";
import { requirePrincipal } from "./auth";
import type { Principal } from "./db";
import { AppError } from "./errors";
import { jsonSafe, platformPage } from "./http";
export function protectedPage<T>(
  loader: (ctx: GetServerSidePropsContext, actor: Principal) => Promise<T>,
) {
  return async (ctx: GetServerSidePropsContext) => {
    try {
      platformPage(ctx);
      const actor = await requirePrincipal(ctx.req);
      const data = await loader(ctx, actor);
      return {
        props: {
          data: jsonSafe(data) as T | null,
          actor: actor as Principal | null,
          error: null as string | null,
        },
      };
    } catch (error) {
      if (error instanceof AppError && error.status === 401)
        return {
          redirect: {
            destination: `/login?next=${encodeURIComponent(ctx.resolvedUrl)}`,
            permanent: false,
          },
        };
      if (error instanceof AppError && [403, 404, 421].includes(error.status))
        return { notFound: true as const };
      ctx.res.statusCode = 503;
      return {
        props: {
          data: null as T | null,
          actor: null as Principal | null,
          error:
            "This page is unavailable. Check the database and identity configuration, then try again." as
              string | null,
        },
      };
    }
  };
}
