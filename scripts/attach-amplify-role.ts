import { readFile } from "node:fs/promises";
import { AmplifyClient, UpdateBranchCommand } from "@aws-sdk/client-amplify";

async function main() {
  const runtime = JSON.parse(await readFile("amplify_outputs.json", "utf8"))
    .custom.hoa;
  if (!process.env.AWS_APP_ID || process.env.AWS_BRANCH !== "development")
    throw new Error("Development deployment context required.");
  await new AmplifyClient({ region: runtime.region }).send(
    new UpdateBranchCommand({
      appId: process.env.AWS_APP_ID,
      branchName: "development",
      computeRoleArn: runtime.computeRoleArn,
    }),
  );
  console.log("Attached the development runtime role.");
}
main().catch(() => {
  console.error(
    "Amplify setup failed; check configuration and AWS permissions. No credentials are printed.",
  );
  process.exitCode = 1;
});
