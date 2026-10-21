import { api } from "@/src/server/http";
import { requirePrincipal } from "@/src/server/auth";
import { submitRegistration } from "@/src/server/communities/service";
export const config = { api: { bodyParser: { sizeLimit: "32kb" } } };
export default api(["POST"], async (req, res) => {
  const actor = await requirePrincipal(req);
  res.status(201).json(await submitRegistration(actor, req.body));
});
