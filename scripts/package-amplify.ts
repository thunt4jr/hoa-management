import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

export async function packageAmplify(
  options = { outputsFile: "amplify_outputs.json", root: ".amplify-hosting" },
) {
  const outputs = JSON.parse(await readFile(options.outputsFile, "utf8"));
  const runtime = outputs.custom?.hoa;
  if (
    !runtime ||
    !/^https:\/\/development\.[a-z0-9]+\.amplifyapp\.com$/.test(runtime.origin)
  )
    throw new Error("Verified development backend outputs are required.");
  const root = options.root;
  const compute = `${root}/compute/default`;
  await rm(root, { recursive: true, force: true });
  await mkdir(compute, { recursive: true });
  await cp(".next/standalone", compute, {
    recursive: true,
    dereference: true,
    filter: (source) =>
      !/^\.env(?:\.|$)/.test(path.basename(source)) &&
      path.basename(source) !== "cache",
  });
  await cp("public", `${compute}/public`, { recursive: true });
  await mkdir(`${root}/static/_next`, { recursive: true });
  await cp(".next/static", `${root}/static/_next/static`, { recursive: true });
  await build({
    entryPoints: ["scripts/amplify-runtime.ts"],
    outfile: `${compute}/entry.cjs`,
    bundle: true,
    platform: "node",
    target: "node24",
    format: "cjs",
    minify: true,
    logLevel: "warning",
  });
  await writeFile(`${compute}/hoa-runtime.json`, JSON.stringify(runtime));
  await writeFile(
    `${root}/deploy-manifest.json`,
    JSON.stringify(
      {
        version: 1,
        routes: [
          {
            path: "/_next/static/*",
            target: {
              kind: "Static",
              cacheControl: "public, max-age=31536000, immutable",
            },
          },
          { path: "/*", target: { kind: "Compute", src: "default" } },
        ],
        computeResources: [
          { name: "default", runtime: "nodejs24.x", entrypoint: "entry.cjs" },
        ],
        framework: {
          // Identify this adapter separately from Amplify's native Next.js adapter.
          name: "nextjs-standalone",
          version: JSON.parse(
            await readFile("node_modules/next/package.json", "utf8"),
          ).version,
        },
      },
      null,
      2,
    ),
  );
  async function bytes(directory: string): Promise<number> {
    let total = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      total += entry.isDirectory()
        ? await bytes(file)
        : (await stat(file)).size;
    }
    return total;
  }
  const size = await bytes(compute);
  if (size > 220 * 1024 * 1024)
    throw new Error("Amplify compute bundle exceeds 220 MiB.");
  console.log(
    `Packaged Node 24 compute: ${(size / 1024 / 1024).toFixed(1)} MiB. Only Next static assets use CDN caching.`,
  );
}
if (process.argv[1]?.endsWith("/package-amplify.ts"))
  packageAmplify().catch(() => {
    console.error(
      "Amplify setup failed; check configuration and AWS permissions. No credentials are printed.",
    );
    process.exitCode = 1;
  });
