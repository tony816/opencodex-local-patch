import { describe, expect, test } from "bun:test";
import { createResponsesPassthroughAdapter } from "../src/adapters/openai-responses";

const provider = {
  adapter: "openai-responses",
  baseUrl: "https://chatgpt.example/backend-api/codex",
  authMode: "forward" as const,
};

describe("OpenAI Responses passthrough sanitization", () => {
  test("drops raw reasoning input content before native GPT passthrough", () => {
    const adapter = createResponsesPassthroughAdapter(provider);
    const request = adapter.buildRequest({
      modelId: "gpt-5.5",
      context: { messages: [] },
      stream: true,
      options: {},
      _rawBody: {
        model: "gpt-5.5",
        input: [
          {
            type: "reasoning",
            id: "rs_1",
            summary: [],
            content: [{ type: "reasoning_text", text: "raw routed reasoning" }],
          },
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "hi" }],
          },
        ],
      },
    }, { headers: new Headers({ authorization: "Bearer token" }) });
    const body = JSON.parse(request.body) as { input: Record<string, unknown>[] };

    expect(body.input[0]).toMatchObject({
      type: "reasoning",
      id: "rs_1",
      summary: [],
      content: [],
    });
    expect(body.input[1]).toMatchObject({
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "hi" }],
    });
  });

  test("normalizes function tool parameter schemas before native GPT passthrough", () => {
    const adapter = createResponsesPassthroughAdapter(provider);
    const request = adapter.buildRequest({
      modelId: "gpt-5.5",
      context: { messages: [] },
      stream: true,
      options: {},
      _rawBody: {
        model: "gpt-5.5",
        input: "hi",
        tools: [
          {
            type: "function",
            name: "codex_app__automation_update",
            description: "Update automations",
            parameters: { type: null, properties: { title: { type: "string" } } },
          },
          {
            type: "function",
            name: "missing_schema_type",
            description: "Missing type",
            parameters: { properties: { title: { type: "string" } } },
          },
          { type: "web_search" },
        ],
      },
    }, { headers: new Headers({ authorization: "Bearer token" }) });
    const body = JSON.parse(request.body) as { tools: Record<string, unknown>[] };

    expect(body.tools[0].parameters).toMatchObject({ type: "object" });
    expect(body.tools[1].parameters).toMatchObject({ type: "object" });
    expect(body.tools[2]).toEqual({ type: "web_search" });
  });
});
