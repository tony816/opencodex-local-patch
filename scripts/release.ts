#!/usr/bin/env bun
/**
 * Release helper (jawcode-style, single package). Not shipped in the npm tarball.
 *
 * Usage:
 *   bun scripts/release.ts <version> [--tag latest|preview] [--publish]
 *       Preflight (clean tree on main + typecheck) → bump package.json → commit → push →
 *       wait for Cross-platform CI → dispatch the Release workflow → watch it.
 *       Dry-run by default; pass --publish to publish.
 *   bun scripts/release.ts watch
 *       Watch the most recent Release run.
 *
 * Example:  bun scripts/release.ts 0.1.0            # dry-run release of 0.1.0
 *           bun scripts/release.ts 0.1.0 --publish  # actually publish 0.1.0
 *
 * Requires: gh CLI (authed). Publishing is tokenless via Trusted Publishing (OIDC) — no NPM_TOKEN.
 */
import { $ } from "bun";

const args = process.argv.slice(2);
interface GhRun {
  conclusion: string | null;
  databaseId: number;
  headSha: string;
  status: string;
  url: string;
}

const CI_WORKFLOW = "ci.yml";
const CI_WAIT_TIMEOUT_MS = 20 * 60 * 1000;
const CI_POLL_MS = 10 * 1000;

async function watchLatest(): Promise<void> {
  const id = (await $`gh run list --workflow release.yml --limit 1 --json databaseId -q '.[0].databaseId'`.text()).trim();
  if (!id) { console.error("No Release runs found yet."); process.exit(1); }
  console.log(`→ watching Release run ${id}`);
  await $`gh run watch ${id} --exit-status --interval 10`;
}

async function listCiRuns(sha: string): Promise<GhRun[]> {
  const raw = await $`gh run list --workflow ${CI_WORKFLOW} --commit ${sha} --limit 20 --json conclusion,databaseId,headSha,status,url`.text();
  const runs = JSON.parse(raw) as GhRun[];
  return runs.filter(run => run.headSha === sha);
}

async function waitForSuccessfulCi(sha: string): Promise<GhRun> {
  const deadline = Date.now() + CI_WAIT_TIMEOUT_MS;
  let attempt = 1;
  while (Date.now() < deadline) {
    const runs = await listCiRuns(sha);
    const successful = runs.find(run => run.status === "completed" && run.conclusion === "success");
    if (successful) {
      console.log(`→ Cross-platform CI passed: ${successful.url}`);
      return successful;
    }

    const failed = runs.find(run => run.status === "completed" && run.conclusion && run.conclusion !== "success");
    if (failed) {
      console.error(`✗ Cross-platform CI failed for ${sha}: ${failed.url}`);
      process.exit(1);
    }

    const state = runs.length > 0
      ? runs.map(run => `${run.status}${run.conclusion ? `/${run.conclusion}` : ""}`).join(", ")
      : "not started yet";
    console.log(`→ waiting for Cross-platform CI (${sha.slice(0, 7)}) attempt ${attempt}: ${state}`);
    attempt += 1;
    await Bun.sleep(CI_POLL_MS);
  }

  console.error(`✗ timed out waiting for Cross-platform CI on ${sha}`);
  process.exit(1);
}

async function remoteMainSha(): Promise<string> {
  const out = (await $`git ls-remote origin refs/heads/main`.text()).trim();
  const [sha] = out.split(/\s+/);
  if (!sha) {
    console.error("✗ could not resolve origin/main");
    process.exit(1);
  }
  return sha;
}

if (args[0] === "watch") {
  await watchLatest();
  process.exit(0);
}

const version = args[0];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("Usage: bun scripts/release.ts <version> [--tag latest|preview] [--publish]\n       bun scripts/release.ts watch");
  process.exit(1);
}
const tag = args.includes("--tag") ? (args[args.indexOf("--tag") + 1] ?? "latest") : "latest";
const dryRun = !args.includes("--publish");

// 1. Preflight — must be on a clean main, and typecheck must pass.
const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
if (branch !== "main") { console.error(`✗ must be on main (currently ${branch}).`); process.exit(1); }
if ((await $`git status --porcelain`.text()).trim()) { console.error("✗ working tree not clean — commit or stash first."); process.exit(1); }
console.log("→ typecheck");
await $`bun x tsc --noEmit`;

// 2. Bump package.json only; the workflow creates the version tag after npm publish.
console.log(`→ bump package.json → ${version}`);
await $`npm version ${version} --no-git-tag-version`;

// 3. Commit + push the version bump.
await $`git add package.json`;
await $`git commit -m ${`release: v${version}`}`;
const releaseSha = (await $`git rev-parse HEAD`.text()).trim();
console.log("→ push origin main");
await $`git push origin main`;

// 4. Wait for the pushed release commit to pass CI, then dispatch the Release workflow.
console.log(`→ wait for Cross-platform CI (${releaseSha})`);
await waitForSuccessfulCi(releaseSha);

const originMain = await remoteMainSha();
if (originMain !== releaseSha) {
  console.error(`✗ origin/main moved while waiting for CI (${originMain} != ${releaseSha}); aborting release dispatch.`);
  process.exit(1);
}

console.log(`→ dispatch Release (tag=${tag}, dry-run=${dryRun})`);
await $`gh workflow run release.yml --ref main -f version=${version} -f tag=${tag} -f dry-run=${String(dryRun)}`;
await Bun.sleep(4000);

// 5. Watch it.
await watchLatest();
console.log(dryRun
  ? "\n✓ Dry run complete. Re-run with --publish to publish for real."
  : "\n✓ Published. Try:  npm install -g @bitkyc08/opencodex");
