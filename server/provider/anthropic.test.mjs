/** Tests for the Anthropic org-key route and the model factory. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { extractJson, createAnthropicModelClient } from "./anthropic.js";
import { createModelClient } from "../model.js";

const config = {
  model: {
    provider: "anthropic",
    apiKey: "",
    baseUrl: "https://api.deepseek.com/v1",
    name: "deepseek-chat",
    timeoutMs: 1_000,
    maxTokens: 100,
  },
  anthropic: {
    apiKey: "test-org-key-not-real",
    baseUrl: "https://api.anthropic.test/v1",
    model: "claude-sonnet-4-5",
    timeoutMs: 1_000,
    maxTokens: 100,
  },
};

const fakeResponse = (body, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

test("extractJson accepts a plain object, a fenced block and a preamble", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('Here you go:\n{"a":3}\nHope that helps.'), { a: 3 });
  assert.throws(() => extractJson("no json here"), /did not return a JSON object/);
  assert.throws(() => extractJson("[1,2,3]"), /did not return a JSON object/);
  assert.throws(() => extractJson(undefined), /no text/);
});

test("no org key means no client, so tailoring falls back to rules", () => {
  assert.equal(createAnthropicModelClient({ anthropic: { apiKey: "" } }), null);
  assert.equal(
    createModelClient({ model: { ...config.model, apiKey: "" }, anthropic: { apiKey: "" } }),
    null
  );
});

test("the org key routes to the Anthropic client, not the OpenAI one", () => {
  const client = createModelClient(config, { fetchImpl: fetch });
  assert.equal(client.kind, "anthropic");
  assert.equal(client.name, "claude-sonnet-4-5");
});

test("a POST goes to /messages with x-api-key and never with a bearer token", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return fakeResponse({ content: [{ type: "text", text: '{"summary":"ok"}' }] });
  };
  const client = createAnthropicModelClient(config, { fetchImpl });
  const result = await client.complete({ system: "be brief", prompt: "tailor this" });

  assert.deepEqual(result, { summary: "ok" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.anthropic.test/v1/messages");
  assert.equal(calls[0].init.headers["x-api-key"], "test-org-key-not-real");
  assert.equal(calls[0].init.headers["anthropic-version"], "2023-06-01");
  assert.equal(calls[0].init.headers.authorization, undefined);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "claude-sonnet-4-5");
  assert.match(body.system, /JSON object/);
  assert.equal(body.messages[0].role, "user");
});

test("a schema that rejects the shape becomes a throw, so the caller can fall back", async () => {
  const fetchImpl = async () => fakeResponse({ content: [{ type: "text", text: '{"wrong":true}' }] });
  const client = createAnthropicModelClient(config, { fetchImpl });
  await assert.rejects(
    () => client.complete({ system: "s", prompt: "p", schema: (value) => typeof value.summary === "string" }),
    /does not match the expected shape/
  );
});

test("upstream errors are reported with the status and never echo the key", async () => {
  const fetchImpl = async () => fakeResponse({ error: { message: "credit balance is too low" } }, false, 400);
  const client = createAnthropicModelClient(config, { fetchImpl });
  await assert.rejects(
    () => client.complete({ system: "s", prompt: "p" }),
    (error) => {
      assert.match(error.message, /anthropic returned 400/);
      assert.equal(error.message.includes("test-org-key-not-real"), false);
      return true;
    }
  );
});

test("the OpenAI-compatible route still wins when the provider says so", () => {
  const client = createModelClient({
    model: { provider: "openai", apiKey: "sk-test", baseUrl: "https://example.test/v1", name: "m", timeoutMs: 1000, maxTokens: 100 },
    anthropic: { apiKey: "org-key" },
  });
  assert.equal(client.kind, "openai-compatible");
});
