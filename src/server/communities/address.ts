import { createHash } from "node:crypto";
import { z } from "zod";

export const addressSchema = z
  .object({
    line1: z.string().trim().min(3).max(160),
    line2: z.string().trim().max(100).default(""),
    city: z.string().trim().min(2).max(100),
    region: z.string().trim().min(2).max(100),
    postalCode: z.string().trim().min(3).max(20),
    country: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/),
  })
  .strict();
export type Address = z.infer<typeof addressSchema>;

function text(value: string) {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function street(value: string) {
  return text(value).replace(
    /\b(STREET|ROAD|AVENUE|BOULEVARD|DRIVE|LANE|COURT|PLACE|APARTMENT|SUITE|UNIT)\b/g,
    (match) =>
      ({
        STREET: "ST",
        ROAD: "RD",
        AVENUE: "AVE",
        BOULEVARD: "BLVD",
        DRIVE: "DR",
        LANE: "LN",
        COURT: "CT",
        PLACE: "PL",
        APARTMENT: "UNIT",
        SUITE: "UNIT",
        UNIT: "UNIT",
      })[match]!,
  );
}

export function normalizeAddress(input: Address) {
  const original = addressSchema.parse(input);
  const normalized = {
    ...original,
    line1: street(original.line1),
    line2: street(original.line2),
    city: text(original.city),
    region: text(original.region),
    country: text(original.country),
    postalCode: text(original.postalCode).replace(/\s+/g, ""),
  };
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        normalized.country,
        normalized.region,
        normalized.city,
        normalized.postalCode,
        normalized.line1,
        normalized.line2,
      ]),
    )
    .digest("hex");
  // A separate coarse key flags similar sites for human review; it never merges units.
  const nearKey = createHash("sha256")
    .update(
      JSON.stringify([
        normalized.country,
        normalized.postalCode.replace(/-.*/, ""),
        normalized.line1.match(/^\d+/)?.[0] || normalized.line1,
      ]),
    )
    .digest("hex");
  return { original, normalized, key, nearKey };
}
