import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CustomResource, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Provider } from "aws-cdk-lib/custom-resources";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

export interface InfrastructureProps {
  appId: string;
  origin: string;
  userPoolId: string;
  userPoolArn: string;
  clientId: string;
}
export function createInfrastructure(stack: Stack, props: InfrastructureProps) {
  const vpc = new ec2.Vpc(stack, "PrivateDatabaseNetwork", {
    maxAzs: 2,
    natGateways: 0,
    subnetConfiguration: [
      { name: "database", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    ],
  });
  const cluster = new rds.DatabaseCluster(stack, "Postgres", {
    engine: rds.DatabaseClusterEngine.auroraPostgres({
      version: rds.AuroraPostgresEngineVersion.VER_17_7,
    }),
    credentials: rds.Credentials.fromGeneratedSecret("hoa_migrations"),
    defaultDatabaseName: "hoa",
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    writer: rds.ClusterInstance.serverlessV2("writer", {
      publiclyAccessible: false,
    }),
    serverlessV2MinCapacity: 0,
    serverlessV2MaxCapacity: 2,
    serverlessV2AutoPauseDuration: Duration.minutes(15),
    enableDataApi: true,
    storageEncrypted: true,
    backup: { retention: Duration.days(7) },
    deletionProtection: true,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const runtimeSecret = new secrets.Secret(stack, "RuntimeDatabaseCredential", {
    generateSecretString: {
      secretStringTemplate: JSON.stringify({ username: "hoa_runtime" }),
      generateStringKey: "password",
      passwordLength: 48,
      excludePunctuation: true,
    },
  });
  const sessionSecret = new secrets.Secret(stack, "SessionSecret", {
    generateSecretString: { passwordLength: 64, excludePunctuation: true },
  });
  runtimeSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);
  sessionSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);
  const domain = new cognito.CfnUserPoolDomain(stack, "ManagedLogin", {
    userPoolId: props.userPoolId,
    domain: `hoa-${props.appId}-development`,
    managedLoginVersion: 1,
  });
  const computeRole = new iam.Role(stack, "WebRuntime", {
    path: "/hoa-management/development/",
    assumedBy: new iam.ServicePrincipal("amplify.amazonaws.com"),
    description:
      "Development web runtime: no migration credential, no public file grants.",
  });
  computeRole.addToPolicy(
    new iam.PolicyStatement({
      actions: [
        "rds-data:BeginTransaction",
        "rds-data:ExecuteStatement",
        "rds-data:CommitTransaction",
        "rds-data:RollbackTransaction",
      ],
      resources: [cluster.clusterArn],
    }),
  );
  runtimeSecret.grantRead(computeRole);
  sessionSecret.grantRead(computeRole);
  computeRole.addToPolicy(
    new iam.PolicyStatement({
      actions: ["cognito-idp:DescribeUserPool", "cognito-idp:AdminGetUser"],
      resources: [props.userPoolArn],
    }),
  );
  const migration = new NodejsFunction(stack, "SchemaMigration", {
    entry: path.resolve("amplify/functions/migrate.ts"),
    handler: "handler",
    runtime: lambda.Runtime.NODEJS_24_X,
    timeout: Duration.minutes(10),
    memorySize: 512,
    bundling: { minify: true, sourceMap: false, externalModules: [] },
    environment: {
      DATABASE_RESOURCE_ARN: cluster.clusterArn,
      DATABASE_SECRET_ARN: cluster.secret!.secretArn,
      DATABASE_NAME: "hoa",
      RUNTIME_SECRET_ARN: runtimeSecret.secretArn,
    },
    logGroup: new LogGroup(stack, "MigrationLog", {
      retention: RetentionDays.ONE_MONTH,
    }),
  });
  cluster.grantDataApiAccess(migration);
  runtimeSecret.grantRead(migration);
  const migrations = readdirSync("db/migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const sql = readFileSync(`db/migrations/${name}`, "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });
  const provider = new Provider(stack, "MigrationProvider", {
    onEventHandler: migration,
  });
  const schema = new CustomResource(stack, "Schema", {
    serviceToken: provider.serviceToken,
    properties: { Migrations: migrations },
  });
  schema.node.addDependency(cluster);
  return {
    region: stack.region,
    origin: props.origin,
    resourceArn: cluster.clusterArn,
    secretArn: runtimeSecret.secretArn,
    database: "hoa",
    sessionSecretArn: sessionSecret.secretArn,
    computeRoleArn: computeRole.roleArn,
    userPoolId: props.userPoolId,
    clientId: props.clientId,
    cognitoDomain: `https://${domain.domain}.auth.${stack.region}.amazoncognito.com`,
  };
}
