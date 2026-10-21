import { z } from "zod";
import { api } from "@/src/server/http";
import { finishLogin } from "@/src/server/auth";
export default api(["GET"], async (req, res) => {
  const { code, state } = z
    .object({
      code: z.string().min(1).max(4096),
      state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    })
    .parse(req.query);
  res.redirect(302, await finishLogin(req, res, code, state));
});
