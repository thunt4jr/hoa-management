import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

let ready: Promise<void> | undefined;

export async function ensureRuntimeSecret() {
  const secretArn = process.env.RUNTIME_SESSION_SECRET_ARN;
  if (!secretArn) return;
  // Compute credentials may become available only after the HTTP server starts.
  // Concurrent requests share initialization; a failed read grants no access.
  ready ??= load(secretArn).catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  await ready;
}

async function load(secretArn: string) {
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION,
    maxAttempts: 2,
  });
  try {
    const value = await client.send(
      new GetSecretValueCommand({ SecretId: secretArn }),
    );
    if (!value.SecretString || value.SecretString.length < 32)
      throw new Error("Missing session secret.");
    process.env.SESSION_SECRET = value.SecretString;
  } finally {
    client.destroy();
  }
}
