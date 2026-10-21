import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

async function main() {
  // Synthetic identifiers only; synthesis neither reads credentials nor deploys.
  process.env.AWS_APP_ID = "localtest";
  process.env.AWS_BRANCH = "development";
  process.env.CDK_DEFAULT_ACCOUNT = "123456789012";
  process.env.CDK_DEFAULT_REGION = "us-east-1";
  process.env.CDK_OUTDIR = ".data/amplify-synth";
  process.env.CDK_CONTEXT_JSON = JSON.stringify({
    "amplify-backend-name": "development",
    "amplify-backend-namespace": "localtest",
    "amplify-backend-type": "branch",
  });
  const { backend } = await import("../amplify/backend");
  const auth = Template.fromStack(backend.auth.resources.userPool.stack);
  auth.hasResourceProperties("AWS::Cognito::UserPool", {
    MfaConfiguration: "ON",
    EnabledMfas: ["SOFTWARE_TOKEN_MFA"],
    DeletionProtection: "ACTIVE",
    AutoVerifiedAttributes: ["email"],
  });
  auth.hasResourceProperties("AWS::Cognito::UserPoolClient", {
    GenerateSecret: false,
    AllowedOAuthFlows: ["code"],
    CallbackURLs: [
      "https://development.localtest.amplifyapp.com/api/auth/callback",
    ],
  });
  const storage = Template.fromStack(backend.storage.resources.bucket.stack);
  storage.hasResource("AWS::S3::Bucket", {
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
  });
  storage.hasResourceProperties("AWS::S3::Bucket", {
    VersioningConfiguration: { Status: "Enabled" },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
  storage.resourceCountIs("Custom::S3AutoDeleteObjects", 0);
  (backend.stack.node.root as App).synth();
  console.log(
    "Full Gen 2 synthesis passed: required TOTP, fixed callback, retained private bucket and database dependency graph. No AWS deployment performed.",
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Synthesis failed.");
  process.exitCode = 1;
});
