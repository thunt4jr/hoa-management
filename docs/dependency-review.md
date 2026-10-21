# Dependency review — 2026-10-21

`npm audit --omit=dev` reports zero advisories for installed production packages.
This is an npm report, not a security review of bundled vendor code or the service.

The full audit reports **46 affected development packages: 43 high, 3 moderate,
zero critical**. These are cascading package findings from three underlying
advisories in the Amplify/GraphQL build tools and globbing dependencies:

| Package | Finding | Current boundary |
|---|---|---|
| `@graphql-tools/utils` ≤12.0.0 | [mergeDeep prototype pollution](https://github.com/advisories/GHSA-7mx3-vvmw-hjmv) | Amplify brings several old GraphQL API generations. Upgrading them all to 13 is an incompatible override requiring upstream fixes and code-generation tests. No GraphQL endpoint or generator accepts tenant input in this app. |
| `braces` ≤3.0.3 | [Deep pattern stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | The latest registry release is still affected. Build/lint patterns come only from the reviewed repository. |
| `csv-parse` <7.0.2 | [Prototype replacement via columns](https://github.com/advisories/GHSA-8cw4-87c7-c6xx) | Amplify tooling uses version 5.6.0. Replacing it with major 7 needs provider compatibility verification. There is no tenant CSV import endpoint. |

These findings are unresolved. Keep builds restricted to trusted development
commits, automatic builds and PR previews disabled, and deployment permissions
separate from runtime. The compute bundle contains traced application dependencies
and a bundled Secrets Manager bootstrap; it does not copy the whole build toolchain.
Review actual reachability and obtain upstream fixes before production approval.

Compatible overrides pin Handlebars 4.7.10, Lodash 4.18.1, Immutable 3.8.4 and
MySQL2 3.24.6 to remove separate advisories, including all reported critical ones.
MySQL2 is an unused transitive schema-tool dependency; PostgreSQL remains the only
database. Remove overrides after provider dependency ranges carry the fixes.
Synthesis, type checks, RLS/restore tests, build and package smoke checks are rerun
after these overrides. Re-run both audits before deployment or dependency updates;
counts and upstream fixes can change.
