# Docs And Release SOT

## Public docs

The public documentation site lives in `docs-site/` and is built with Astro + Starlight. English is
served at the site root, Korean under `/ko`, and Simplified Chinese under `/zh-cn`.

Manual navigation is defined in `docs-site/astro.config.mjs`. When adding a public page, update the
sidebar and either add localized copies or intentionally accept Starlight fallback behavior.

## GitHub Pages

`.github/workflows/deploy-docs.yml` publishes the docs to:

```text
https://lidge-jun.github.io/opencodex/
```

The workflow runs on `main` pushes touching `docs-site/**` or the workflow itself, builds
`docs-site`, uploads the artifact, and deploys with GitHub Pages.

Local validation:

```bash
cd docs-site
bun install --frozen-lockfile
bun run build
```

## Root README

The root READMEs are the concise product entrypoint. They should explain what opencodex does, how to
install/start it, where Codex state is touched, and where the full docs live. Deep implementation
invariants belong in `structure/`, not the README.

## Historical docs

`docs/` contains investigations and diagnostic notes. Do not treat it as the current public user
manual. When an investigation graduates into a maintained invariant, summarize it here under
`structure/` and link public workflows from `docs-site/`.

## Release workflow

Package release is npm-focused. `package.json` exposes `opencodex` and `ocx`, `prepublishOnly` runs
typecheck and GUI build, and `scripts/release.ts` handles version bump, commit/push, waiting for
Cross-platform CI, and dispatching the GitHub Release workflow. Docs publishing is separate from npm
release publishing.

## Cross-platform CI

`.github/workflows/ci.yml` is the ordinary quality gate for runtime/package changes. It runs on
Linux and Windows only, using the intentionally short command set:

```bash
bun install --frozen-lockfile
bun x tsc --noEmit
bun test tests
bun build scripts/release.ts --target=bun --outdir=.tmp/ci-release-script-check
bun run src/cli.ts help
```

The CI intentionally does not build docs, build the GUI, run coverage, run macOS, or perform remote
Ubuntu/RDP smoke tests. Those stay outside the default gate until a concrete regression justifies the
extra runtime.

The Release workflow remains manual and publish-focused. Before any dry-run or publish step, it
checks that the exact release commit (`GITHUB_SHA`) already has a successful Cross-platform CI run.
This keeps release runs short and makes release a deployment of a verified commit rather than a
second CI pipeline.
