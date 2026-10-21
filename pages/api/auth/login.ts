import { api } from "@/src/server/http";
import { beginLogin } from "@/src/server/auth";
export default api(["GET"], async (req, res) => {
  res.redirect(302, await beginLogin(req, res, req.query.next));
});
