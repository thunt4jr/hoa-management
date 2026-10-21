import { defineBackend } from "@aws-amplify/backend";
import { RemovalPolicy } from "aws-cdk-lib";
import { auth } from "./auth/resource";
import { storage } from "./storage/resource";
import { createInfrastructure } from "./infrastructure";

export const backend = defineBackend({ auth, storage });
const appId = process.env.AWS_APP_ID;
const branch = process.env.AWS_BRANCH;
if (!appId || branch !== "development")
  throw new Error(
    "Only the explicitly authorized development branch can deploy. Supply AWS_APP_ID and AWS_BRANCH.",
  );
const origin = `https://development.${appId}.amplifyapp.com`;
const { cfnUserPool, cfnUserPoolClient } = backend.auth.resources.cfnResources;
cfnUserPool.policies = {
  passwordPolicy: {
    minimumLength: 14,
    requireLowercase: true,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: true,
  },
  signInPolicy: { allowedFirstAuthFactors: ["PASSWORD"] },
};
cfnUserPool.deletionProtection = "ACTIVE";
cfnUserPool.applyRemovalPolicy(RemovalPolicy.RETAIN);
cfnUserPoolClient.allowedOAuthFlowsUserPoolClient = true;
cfnUserPoolClient.allowedOAuthFlows = ["code"];
cfnUserPoolClient.allowedOAuthScopes = ["openid", "email"];
cfnUserPoolClient.callbackUrLs = [`${origin}/api/auth/callback`];
cfnUserPoolClient.logoutUrLs = [`${origin}/login`];
cfnUserPoolClient.supportedIdentityProviders = ["COGNITO"];
cfnUserPoolClient.generateSecret = false;
cfnUserPoolClient.preventUserExistenceErrors = "ENABLED";
const bucket = backend.storage.resources.cfnResources.cfnBucket;
bucket.publicAccessBlockConfiguration = {
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
};
bucket.versioningConfiguration = { status: "Enabled" };
bucket.bucketEncryption = {
  serverSideEncryptionConfiguration: [
    { serverSideEncryptionByDefault: { sseAlgorithm: "AES256" } },
  ],
};
bucket.applyRemovalPolicy(RemovalPolicy.RETAIN);
const runtime = createInfrastructure(backend.createStack("database"), {
  appId,
  origin,
  userPoolId: backend.auth.resources.userPool.userPoolId,
  userPoolArn: backend.auth.resources.userPool.userPoolArn,
  clientId: backend.auth.resources.userPoolClient.userPoolClientId,
});
backend.addOutput({ custom: { hoa: runtime } });
