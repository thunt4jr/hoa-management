import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// Amplify detects a literal "next build" npm script as its native adapter.
// Invoke the same CLI explicitly so our compute deployment manifest is used.
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "build", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
