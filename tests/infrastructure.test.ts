import test from "node:test";
import assert from "node:assert/strict";
import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { createInfrastructure } from "../amplify/infrastructure";

test("Amplify database is private and runtime cannot read the migration secret", () => {
  const stack = new Stack(new App(), "TestDatabase", {
    env: { account: "123456789012", region: "us-east-1" },
  });
  createInfrastructure(stack, {
    appId: "testapp",
    origin: "https://development.testapp.amplifyapp.com",
    userPoolId: "us-east-1_test",
    userPoolArn:
      "arn:aws:cognito-idp:us-east-1:123456789012:userpool/us-east-1_test",
    clientId: "testclient",
  });
  const template = Template.fromStack(stack);
  template.resourceCountIs("AWS::EC2::NatGateway", 0);
  template.resourceCountIs("AWS::DynamoDB::Table", 0);
  template.hasResourceProperties("AWS::RDS::DBCluster", {
    Engine: "aurora-postgresql",
    EnableHttpEndpoint: true,
    StorageEncrypted: true,
    DeletionProtection: true,
    ServerlessV2ScalingConfiguration: {
      MinCapacity: 0,
      MaxCapacity: 2,
      SecondsUntilAutoPause: 900,
    },
  });
  template.hasResourceProperties("AWS::RDS::DBInstance", {
    PubliclyAccessible: false,
    DBInstanceClass: "db.serverless",
  });
  template.hasResource("AWS::RDS::DBCluster", {
    DeletionPolicy: "Retain",
    UpdateReplacePolicy: "Retain",
  });
  const policies = template.findResources("AWS::IAM::Policy", {
    Properties: { PolicyName: Match.stringLikeRegexp("WebRuntime") },
  });
  const json = JSON.stringify(policies);
  assert.ok(json.includes("RuntimeDatabaseCredential"));
  assert.ok(json.includes("SessionSecret"));
  assert.ok(!json.includes("PostgresSecret"));
  assert.ok(!json.includes("s3:"));
  assert.ok(!json.includes("rds-data:*"));
});
