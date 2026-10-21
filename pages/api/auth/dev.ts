import { z } from "zod";
import { api } from "@/src/server/http";
import { developmentLogin } from "@/src/server/auth";
import { developmentPersonas } from "@/src/development-personas";
export default api(["POST"], async (req, res) => {
  const { persona } = z
    .object({ persona: z.enum(developmentPersonas) })
    .strict()
    .parse(req.body);
  await developmentLogin(req, res, persona);
  res.status(200).json({ ok: true });
});
