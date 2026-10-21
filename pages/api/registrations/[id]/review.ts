import { api, queryId } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/auth";
import { reviewRegistration } from "@/src/server/communities/service";
export default api(["POST"], async (req, res) => {
  res.json(
    await reviewRegistration(
      await requirePrincipal(req),
      queryId(req, "id"),
      req.body,
    ),
  );
});
