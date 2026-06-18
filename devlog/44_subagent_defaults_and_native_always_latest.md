# Phase 8b — Default subagent models + native list always-latest

Follow-up to phase 8. Two small changes; the routing complaint that prompted them was a stale Codex
session, not a bug (a TUI opened before phase 8's inject fix still had `model_provider` unset → hit
ChatGPT directly; a fresh `codex` from any dir now shows `provider: opencodex`).

## Native OpenAI list was stale (phantom models)
`NATIVE_OPENAI_MODELS` hard-coded `gpt-5.2` and `gpt-5.3-codex`, which Codex 0.141.0 does not ship —
advertising them makes ChatGPT 400 "model is not supported" (verified live for `gpt-5.3-codex`). The
installed Codex actually exposes: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`.

**Fix:** `nativeOpenAiSlugs()` returns the live Codex catalog's own bare slugs
(`listCatalogNativeSlugs()`) when present, else the static fallback (now corrected to the 4 real ids).
`/v1/models` uses it — native models always match the installed Codex, no more phantoms.

## Subagent picker default = native GPT models, removable
Requested default featured set: the GPT natives. `gpt-5.3-codex` doesn't exist here, so the real set
is the 4 above (Codex's spawn_agent always advertises 5, so the 5th slot falls through to the first
routed model — unavoidable without inventing a phantom).

- `config.ts`: `DEFAULT_SUBAGENT_MODELS` + `getDefaultConfig()` seeds it (fresh installs).
- `server.ts` `startServer`: seed `subagentModels` ONLY when unset (`undefined`). A user-set list —
  including `[]` — is left alone, so GUI removals persist (the picker's PUT just writes the array).
- `/api/subagent-models` already lists native slugs as `available`, so they're selectable/removable.

## Verified
- Seed on unset config → `subagentModels=[gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.3-codex-spark]`;
  catalog priorities 0–3 (they lead spawn_agent's take(5)).
- PUT removing one → persists (3); restore → 4. `tsc` clean.
- Fresh `codex exec` from `cli-rp/app` (default `opencode-go/minimax-m3`) → `provider: opencodex`, OK.
</content>
