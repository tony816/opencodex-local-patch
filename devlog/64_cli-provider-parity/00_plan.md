# Plan — CLI `ocx init` provider-catalog parity with the GUI

## Goal gap (from the active goal's last checkpoint)
The GUI exposes the full provider set (30 KEY_LOGIN API-key providers via `/api/key-providers`
+ 3 OAuth + local), but the CLI `ocx init` ships **7 hardcoded `PRESETS`** that don't reference the
registries. So the goal's "GUI(10100)+CLI 양쪽" is unmet on the CLI side: a CLI user can't pick
deepseek/mistral/kilo/minimax/etc. without "custom".

## Change
Refactor `src/init.ts` to build its provider menu from the authoritative registries instead of a
private list:
- `OAUTH_PROVIDERS` (oauth/index) → account-login entries (xai/anthropic/kimi).
- `KEY_LOGIN_PROVIDERS` (oauth/key-providers) → the full API-key catalog (30).
- A few non-catalog key providers (OpenAI API-key, OpenRouter, Groq, Google, Azure) + ChatGPT-forward.
- Local (ollama/vllm/lm-studio).

Wizard behavior per kind:
- **forward** (ChatGPT login): save `authMode:"forward"`, no key.
- **oauth**: save the provider entry, then instruct `ocx login <id>` (the existing OAuth CLI flow).
- **key**: show the provider's `dashboardUrl` ("get your key here"), collect the key (or `${ENV}`),
  and `enrichProviderFromCatalog` so the catalog's models/noVisionModels classification is applied
  (same enrichment the GUI POST does).
- **local**: blank key by default.

Add a testable `buildInitProviders()` exported for verification.

## Files
- MODIFY `src/init.ts` — registry-driven menu + per-kind handling + catalog enrichment.

## Verify
- `bun x tsc --noEmit` clean.
- Probe `buildInitProviders()`: asserts the menu contains the full KEY_LOGIN catalog (all 30 ids),
  the 3 OAuth ids, and the 3 local ids — i.e., CLI now reaches the same providers as the GUI.
