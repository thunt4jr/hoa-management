import { api, queryId, jsonSafe } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/auth";
import { dashboard } from "@/src/server/communities/service";
export default api(["GET"], async (req, res) => {
  res.json(
    jsonSafe(await dashboard(await requirePrincipal(req), queryId(req, "id"))),
  );
});
