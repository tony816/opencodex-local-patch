import * as readline from "node:readline";
import { injectCodexConfig } from "./codex-inject";
import { getDefaultConfig, saveConfig } from "./config";
import { KEY_LOGIN_PROVIDERS, enrichProviderFromCatalog } from "./oauth/key-providers";
import { OAUTH_PROVIDERS } from "./oauth";
import type { OcxConfig, OcxProviderConfig } from "./types";

function createPrompt(): { ask(question: string): Promise<string>; close(): void } {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask(question: string): Promise<string> {
      return new Promise(resolve => rl.question(question, resolve));
    },
    close() { rl.close(); },
  };
}

type InitKind = "forward" | "oauth" | "key" | "local";
export interface InitProvider {
  id: string;
  label: string;
  adapter: string;
  baseUrl: string;
  kind: InitKind;
  dashboardUrl?: string;
  defaultModel?: string;
}

const OAUTH_LABELS: Record<string, string> = {
  xai: "xAI (Grok)", anthropic: "Anthropic (Claude)", kimi: "Kimi (Moonshot)",
};

/**
 * The full CLI provider menu, built from the SAME registries the GUI uses (OAUTH_PROVIDERS +
 * KEY_LOGIN_PROVIDERS) plus the ChatGPT-forward, a few non-catalog key providers, and local servers —
 * so `ocx init` reaches provider parity with the GUI. Exported for verification.
 */
export function buildInitProviders(): InitProvider[] {
  const out: InitProvider[] = [];
  // ChatGPT login (no key) — the default forward provider.
  out.push({ id: "openai", label: "OpenAI — ChatGPT login (no key)", adapter: "openai-responses", baseUrl: "https://chatgpt.com/backend-api/codex", kind: "forward" });
  // Real account logins (OAuth).
  for (const id of Object.keys(OAUTH_PROVIDERS)) {
    const pc = OAUTH_PROVIDERS[id].providerConfig;
    out.push({ id, label: `${OAUTH_LABELS[id] ?? id} — account login`, adapter: pc.adapter, baseUrl: pc.baseUrl, kind: "oauth", defaultModel: pc.defaultModel });
  }
  // Key providers not in the catalog (native adapters / well-known endpoints).
  out.push({ id: "openai-apikey", label: "OpenAI (API key)", adapter: "openai-responses", baseUrl: "https://api.openai.com/v1", kind: "key", dashboardUrl: "https://platform.openai.com/api-keys", defaultModel: "gpt-5.5" });
  out.push({ id: "openrouter", label: "OpenRouter", adapter: "openai-chat", baseUrl: "https://openrouter.ai/api/v1", kind: "key", dashboardUrl: "https://openrouter.ai/keys" });
  out.push({ id: "groq", label: "Groq", adapter: "openai-chat", baseUrl: "https://api.groq.com/openai/v1", kind: "key", dashboardUrl: "https://console.groq.com/keys" });
  out.push({ id: "google", label: "Google Gemini", adapter: "google", baseUrl: "https://generativelanguage.googleapis.com", kind: "key", dashboardUrl: "https://aistudio.google.com/apikey", defaultModel: "gemini-3-pro" });
  out.push({ id: "azure-openai", label: "Azure OpenAI", adapter: "azure", baseUrl: "https://{resource}.openai.azure.com/openai/deployments/{deployment}", kind: "key", dashboardUrl: "https://portal.azure.com" });
  // The full API-key catalog (deepseek, mistral, kilo, minimax, … — same set the GUI shows).
  for (const [id, p] of Object.entries(KEY_LOGIN_PROVIDERS)) {
    out.push({ id, label: p.label, adapter: p.adapter, baseUrl: p.baseUrl, kind: "key", dashboardUrl: p.dashboardUrl, defaultModel: p.defaultModel });
  }
  // Local servers (usually no key).
  out.push({ id: "ollama", label: "Ollama (local)", adapter: "openai-chat", baseUrl: "http://localhost:11434/v1", kind: "local" });
  out.push({ id: "vllm", label: "vLLM (local)", adapter: "openai-chat", baseUrl: "http://localhost:8000/v1", kind: "local" });
  out.push({ id: "lm-studio", label: "LM Studio (local)", adapter: "openai-chat", baseUrl: "http://localhost:1234/v1", kind: "local" });
  return out;
}

const KIND_HEADING: Record<InitKind, string> = {
  forward: "ChatGPT login",
  oauth: "Account login (OAuth — then run: ocx login <id>)",
  key: "API key (paste a key from the provider's dashboard)",
  local: "Local servers (usually no key)",
};

function printMenu(providers: InitProvider[]): void {
  console.log("Available providers:");
  let lastKind: InitKind | null = null;
  providers.forEach((p, i) => {
    if (p.kind !== lastKind) { console.log(`\n  ${KIND_HEADING[p.kind]}:`); lastKind = p.kind; }
    console.log(`   ${String(i + 1).padStart(2)}. ${p.label}`);
  });
  console.log(`\n   ${providers.length + 1}. custom (enter URL manually)`);
}

const envKeyFor = (id: string) => `${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;

export async function runInit(): Promise<void> {
  const prompt = createPrompt();
  console.log("\n🔧 opencodex (ocx) setup\n");

  const providers = buildInitProviders();
  printMenu(providers);

  const choice = await prompt.ask("\nSelect provider (number): ");
  const idx = parseInt(choice, 10) - 1;

  let providerName: string;
  let providerConfig: OcxProviderConfig;
  let oauthHint = false;

  if (idx >= 0 && idx < providers.length) {
    const p = providers[idx];
    providerName = p.id;
    console.log(`\n📡 ${p.label}`);
    console.log(`   Base URL: ${p.baseUrl}`);

    if (p.kind === "forward") {
      providerConfig = { adapter: p.adapter, baseUrl: p.baseUrl, authMode: "forward" };
      console.log("   No API key needed — forwards your existing `codex login`.");
    } else if (p.kind === "oauth") {
      providerConfig = { adapter: p.adapter, baseUrl: p.baseUrl, authMode: "oauth", ...(p.defaultModel ? { defaultModel: p.defaultModel } : {}) };
      oauthHint = true;
    } else {
      // key + local: collect a key (local usually blank).
      if (p.dashboardUrl) console.log(`   🔑 Get your key: ${p.dashboardUrl}`);
      const env = envKeyFor(p.id);
      const hint = p.kind === "local" ? "API key (usually blank — press Enter): " : `API key (paste, or env var $${env}): `;
      const apiKey = (await prompt.ask(`\n${hint}`)).trim();
      const modelChoice = (await prompt.ask(`Default model${p.defaultModel ? ` [${p.defaultModel}]` : " (optional)"}: `)).trim();
      const defaultModel = modelChoice || p.defaultModel;
      providerConfig = {
        adapter: p.adapter,
        baseUrl: p.baseUrl,
        ...(p.kind === "key" ? { apiKey: apiKey || `\${${env}}` } : apiKey ? { apiKey } : {}),
        ...(defaultModel ? { defaultModel } : {}),
      };
      // Apply the catalog's models / vision classification (same enrichment as the GUI).
      enrichProviderFromCatalog(p.id, providerConfig);
    }
  } else {
    providerName = await prompt.ask("Provider name: ");
    const baseUrl = await prompt.ask("Base URL (e.g. http://localhost:11434/v1): ");
    const adapter = await prompt.ask("Adapter [openai-chat]: ") || "openai-chat";
    const apiKey = await prompt.ask("API key (optional): ");
    const defaultModel = await prompt.ask("Default model: ");
    providerConfig = {
      adapter: adapter.trim(),
      baseUrl: baseUrl.trim(),
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      ...(defaultModel.trim() ? { defaultModel: defaultModel.trim() } : {}),
    };
  }

  const portStr = await prompt.ask("\nProxy port [10100]: ");
  const port = parseInt(portStr, 10) || 10100;

  const config: OcxConfig = {
    ...getDefaultConfig(),
    port,
    providers: { [providerName]: providerConfig },
    defaultProvider: providerName,
  };

  saveConfig(config);
  console.log(`\n✅ Config saved to ~/.opencodex/config.json`);
  if (oauthHint) console.log(`🔐 Authenticate this provider with:  ocx login ${providerName}`);

  const injectAnswer = await prompt.ask("Inject into Codex config.toml? [Y/n]: ");
  if (injectAnswer.trim().toLowerCase() !== "n") {
    console.log("Fetching available models from provider...");
    const result = await injectCodexConfig(port, config);
    console.log(result.success ? `✅ ${result.message}` : `⚠️  ${result.message}`);
  }

  console.log(`\n🚀 Setup complete! Run 'ocx start' to start the proxy.`);
  prompt.close();
}
