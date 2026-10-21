import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".data/**",
    ".amplify/**",
    "**/.amplify-hosting/**",
    "cdk.out/**",
    ".npm/**",
    "test-results/**",
    "playwright-report/**",
    "out/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);
