import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  AmplifyClient,
  ListAppsCommand,
  GetAppCommand,
  CreateAppCommand,
  GetBranchCommand,
  CreateBranchCommand,
} from "@aws-sdk/client-amplify";
import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";

// Run using an authenticated AWS_PROFILE and region. Tokens remain in memory.
// Reuse only an explicitly matched app/repository; never alter unrelated apps.
class SetupError extends Error {}
async function main() {
  const region = process.env.AWS_REGION || "us-east-1";
  if (!process.env.AWS_PROFILE || region !== "us-east-1")
    throw new SetupError(
      "Supply an explicit AWS_PROFILE and use the authorized us-east-1 region.",
    );
  const amplify = new AmplifyClient({ region });
  const iam = new IAMClient({ region });
  const repository = "https://github.com/thunt4jr/hoa-management";
  let appId = process.env.AWS_APP_ID;
  if (!appId) {
    const matches = [];
    let nextToken: string | undefined;
    do {
      const apps = await amplify.send(
        new ListAppsCommand({ maxResults: 100, nextToken }),
      );
      matches.push(
        ...(apps.apps || []).filter((app) => app.name === "hoa-management"),
      );
      nextToken = apps.nextToken;
    } while (nextToken);
    if (matches.length) {
      if (matches.length !== 1 || matches[0].repository !== repository)
        throw new SetupError(
          "Ambiguous existing app. Supply an explicitly reviewed AWS_APP_ID.",
        );
      appId = matches[0].appId;
    }
  }
  if (appId) {
    const existing = (await amplify.send(new GetAppCommand({ appId }))).app;
    if (
      existing?.repository !== repository ||
      existing.platform !== "WEB_COMPUTE"
    )
      throw new SetupError(
        "Existing app repository/platform mismatch. No IAM changes were made.",
      );
  }
  const roleName = "hoa-management-development-build";
  let role;
  try {
    role = (await iam.send(new GetRoleCommand({ RoleName: roleName }))).Role;
  } catch (error) {
    if ((error as Error).name !== "NoSuchEntityException") throw error;
    role = (
      await iam.send(
        new CreateRoleCommand({
          RoleName: roleName,
          Description: "Amplify Gen 2 development deployment",
          AssumeRolePolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "amplify.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          }),
        }),
      )
    ).Role;
  }
  if (!role?.Arn || role.Description !== "Amplify Gen 2 development deployment")
    throw new SetupError(
      "The build role must belong to this deployment. Review the existing role before retrying.",
    );
  await iam.send(
    new AttachRolePolicyCommand({
      RoleName: roleName,
      PolicyArn:
        "arn:aws:iam::aws:policy/service-role/AmplifyBackendDeployFullAccess",
    }),
  );
  if (!appId) {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const result = await amplify.send(
      new CreateAppCommand({
        name: "hoa-management",
        repository,
        accessToken: token,
        platform: "WEB_COMPUTE",
        iamServiceRoleArn: role.Arn,
        enableBranchAutoBuild: false,
        buildSpec: await readFile("amplify.yml", "utf8"),
      }),
    );
    appId = result.app?.appId;
  }
  if (!appId) throw new SetupError("No app ID returned.");
  const app = (await amplify.send(new GetAppCommand({ appId }))).app;
  if (
    app?.repository !== repository ||
    app.platform !== "WEB_COMPUTE" ||
    app.iamServiceRoleArn !== role.Arn
  )
    throw new SetupError(
      "App repository/platform/build-role mismatch. Review app configuration before retrying.",
    );
  try {
    await amplify.send(
      new GetBranchCommand({ appId, branchName: "development" }),
    );
  } catch (error) {
    if ((error as Error).name !== "NotFoundException") throw error;
    await amplify.send(
      new CreateBranchCommand({
        appId,
        branchName: "development",
        stage: "DEVELOPMENT",
        framework: "Custom",
        enableAutoBuild: false,
        enablePullRequestPreview: false,
      }),
    );
  }
  const account = role.Arn.split(":")[4];
  await iam.send(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: "AttachDevelopmentRuntime",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "amplify:UpdateBranch",
            Resource: `arn:aws:amplify:${region}:${account}:apps/${appId}/branches/development`,
          },
          {
            Effect: "Allow",
            Action: "iam:PassRole",
            Resource: `arn:aws:iam::${account}:role/hoa-management/development/*`,
            Condition: {
              StringEquals: { "iam:PassedToService": "amplify.amazonaws.com" },
            },
          },
        ],
      }),
    }),
  );
  await mkdir(".data", { recursive: true });
  await writeFile(
    ".data/amplify-development.json",
    JSON.stringify(
      { appId, region, origin: `https://development.${appId}.amplifyapp.com` },
      null,
      2,
    ),
  );
  console.log(
    `Development app prepared: ${appId} (${region}). Auto-build and previews are disabled. Backend and hosting deployment are separate explicit steps.`,
  );
}
main().catch((error) => {
  console.error(
    error instanceof SetupError
      ? error.message
      : `Amplify preparation failed (${error instanceof Error ? error.name : "unknown"}); check AWS/GitHub access. No provider response or credentials are printed.`,
  );
  process.exitCode = 1;
});
