import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAddress } from "../src/server/communities/address";
import { registrationSchema } from "../src/server/communities/service";
import { classifyHost, safeReturnPath, validSlug } from "../src/server/hosts";
import { config } from "../src/server/config";
const address = {
  line1: "100 Main Street",
  line2: "Unit 2",
  city: "Sample City",
  region: "NY",
  postalCode: "10001",
  country: "US",
};
test("address normalization preserves original and meaningful units", () => {
  const first = normalizeAddress(address),
    equivalent = normalizeAddress({
      ...address,
      line1: " 100  MAIN ST. ",
      city: "SAMPLE CITY",
    });
  assert.equal(first.key, equivalent.key);
  assert.deepEqual(first.original, address);
  assert.notEqual(
    first.key,
    normalizeAddress({ ...address, line2: "Unit 3" }).key,
  );
  assert.equal(
    first.nearKey,
    normalizeAddress({ ...address, line2: "Unit 3" }).nearKey,
  );
});
test("hostnames are exact, reserved, and never interpreted as authorization", () => {
  assert.equal(classifyHost("localhost:3000").kind, "platform");
  assert.deepEqual(classifyHost("courtyard.localhost:3000"), {
    kind: "community",
    slug: "courtyard",
  });
  for (const host of [
    "evil.example",
    "localhost.attacker.test:3000",
    "admin.localhost:3000",
    "courtyard.localhost:3000@evil.test",
    "courtyard.localhost:3000,evil",
  ]) {
    assert.throws(() => classifyHost(host));
  }
  for (const slug of ["admin", "api", "a", "-hello", "test-", "a.b", "mail"]) {
    assert.equal(validSlug(slug), false);
  }
});
test("OAuth return paths cannot redirect to external or protocol-relative hosts", () => {
  for (const path of [
    "//evil.test",
    "https://evil.test",
    "/\\evil.test",
    "/%2f%2fevil.test",
    "/\r\nLocation: evil",
  ]) {
    assert.equal(safeReturnPath(path), "/app");
  }
  assert.equal(
    safeReturnPath("/communities/123?tab=records"),
    "/communities/123?tab=records",
  );
});
test("development identity fails closed in production", () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.SESSION_SECRET = "a".repeat(64);
    process.env.PLATFORM_ORIGIN = "https://portal.example.test";
    process.env.AUTH_MODE = "development";
    process.env.ALLOW_DEV_AUTH = "true";
    assert.throws(() => config());
  } finally {
    process.env = previous;
  }
});
test("registration rejects self-assigned privileges and invalid timezones", () => {
  const input = {
    legalName: "Synthetic Test Association",
    displayName: "Synthetic Test",
    slug: "synthetic-test",
    associationType: "hoa",
    propertyCount: 20,
    timezone: "America/New_York",
    address,
    mailingAddress: address,
    representative: "Synthetic Representative",
    representativeTitle: "Board representative",
    authorityEvidence:
      "Synthetic board resolution available for authority review.",
    kind: "new",
  };
  assert.equal(registrationSchema.safeParse(input).success, true);
  assert.equal(
    registrationSchema.safeParse({ ...input, role: "platform_admin" }).success,
    false,
  );
  const invalid = registrationSchema.safeParse({
    ...input,
    timezone: "Invented/Timezone",
  });
  assert.equal(invalid.success, false);
  if (!invalid.success)
    assert.ok(
      invalid.error.issues.some((issue) => issue.path[0] === "timezone"),
    );
});
