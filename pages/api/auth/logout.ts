import { api } from "@/src/server/http";
import { signOut } from "@/src/server/auth";
export default api(["POST"], async (req, res) => {
  await signOut(req, res);
  res.status(200).json({ ok: true });
});
