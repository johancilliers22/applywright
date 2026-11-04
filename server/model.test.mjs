/**
 * Source fixture for the OpenAI-compatible adapter's additive internal failure
 * classification. Authored, not executed in this delivery.
 *
 *   node --test server/model.test.mjs
 */
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { createModelClient } from "./model.js";

const DUMMY_KEY = "synthetic-dummy-not-a-credential";
const DUMMY_BASE_URL = "https://model.invalid/v1";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function syntheticConfig() {
  return {
    anthropic: { apiKey: "" },
    model: {
      provider: "openai",
      apiKey: DUMMY_KEY,
      baseUrl: DUMMY_BASE_URL,
      name: "synthetic-model",
      timeoutMs: 1_000,
      maxTokens: 64,
    },
  };
}

function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return calls;
}

function envelope(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => "",
  };
}

function failureOf(error) {
  assert.ok(error instanceof Error, "expected an Error rejection");
  assert.ok(error.modelFailure && typeof error.modelFailure === "object", "expected modelFailure metadata");
  return error.modelFailure;
}

async function rejectsWith(promise, expected, expectedMessage) {
  await assert.rejects(promise, (error) => {
    assert.deepEqual(failureOf(error), expected);
    if (expectedMessage !== undefined) assert.equal(error.message, expectedMessage);
    return true;
  });
}

test("returns the parsed payload unchanged and preserves the request contract", async () => {
  const calls = stubFetch(() => envelope('{"summary":"kept"}'));
  const client = createModelClient(syntheticConfig());

  assert.equal(client.kind, "openai-compatible");
  assert.equal(client.name, "synthetic-model");

  const parsed = await client.complete({ system: "system text", prompt: "prompt text" });
  assert.deepEqual(parsed, { summary: "kept" });
  assert.equal("modelFailure" in parsed, false);

  assert.equal(calls.length, 1);
  const [{ url, init }] = calls;
  assert.equal(url, `${DUMMY_BASE_URL}/chat/completions`);
  assert.equal(init.method, "POST");
  assert.deepEqual(init.headers, {
    "content-type": "application/json",
    authorization: `Bearer ${DUMMY_KEY}`,
  });
  assert.deepEqual(JSON.parse(init.body), {
    model: "synthetic-model",
    messages: [
      { role: "system", content: "system text" },
      { role: "user", content: "prompt text" },
    ],
    temperature: 0.2,
    max_tokens: 64,
    response_format: { type: "json_object" },
  });
  assert.ok(init.signal instanceof AbortSignal);
});

test("accepts a valid reply when the optional function schema is omitted", async () => {
  stubFetch(() => envelope('{"summary":"kept"}'));
  const client = createModelClient(syntheticConfig());

  const parsed = await client.complete({ system: "system", prompt: "prompt" });
  assert.deepEqual(parsed, { summary: "kept" });
});

test("accepts a reply that satisfies the optional function schema", async () => {
  stubFetch(() => envelope('{"summary":"kept"}'));
  const client = createModelClient(syntheticConfig());

  const parsed = await client.complete({
    system: "system",
    prompt: "prompt",
    schema: (value) => value.summary === "kept",
  });
  assert.deepEqual(parsed, { summary: "kept" });
});

test("classifies an unknown request failure as transport", async () => {
  stubFetch(() => {
    throw new Error("socket closed");
  });
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "transport", stage: "request" },
    "model request failed: socket closed",
  );
});

test("classifies a genuine TimeoutError as timeout", async () => {
  stubFetch(() => {
    const error = new Error("the operation timed out");
    error.name = "TimeoutError";
    throw error;
  });
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "timeout", stage: "request" },
    "model request failed: the operation timed out",
  );
});

test("does not treat a generic AbortError as a timeout", async () => {
  stubFetch(() => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  });
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "transport", stage: "request" },
    "model request failed: aborted",
  );
});

test("classifies a non-2xx response with numeric status and truncated detail", async () => {
  stubFetch(() => ({
    ok: false,
    status: 429,
    text: async () => "d".repeat(250),
    json: async () => {
      throw new Error("must not parse an error body");
    },
  }));
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "http", stage: "http", status: 429 },
    `model returned 429: ${"d".repeat(200)}`,
  );
});

test("classifies an envelope JSON failure at the response stage", async () => {
  stubFetch(() => ({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("unexpected envelope token");
    },
    text: async () => "",
  }));
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "parse", stage: "response" },
    "unexpected envelope token",
  );
});

test("classifies invalid completion content at the content stage", async () => {
  stubFetch(() => envelope("this is not json"));
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "parse", stage: "content" },
    "model returned content that is not JSON",
  );
});

test("rejects missing completion content as empty", async () => {
  stubFetch(() => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [] }),
    text: async () => "",
  }));
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "empty", stage: "content" },
    "model returned no content",
  );
});

test("rejects blank completion content as empty", async () => {
  stubFetch(() => envelope("   "));
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "empty", stage: "content" },
    "model returned no content",
  );
});

test("classifies a false function-schema result as a schema failure", async () => {
  stubFetch(() => envelope('{"summary":"kept"}'));
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt", schema: () => false }),
    { kind: "schema", stage: "schema" },
    "model returned JSON that does not match the expected shape",
  );
});

test("classifies a thrown function-schema error as a schema failure", async () => {
  stubFetch(() => envelope('{"summary":"kept"}'));
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({
      system: "system",
      prompt: "prompt",
      schema: () => {
        throw new Error("shape exploded");
      },
    }),
    { kind: "schema", stage: "schema" },
    "shape exploded",
  );
});

test("classifies a null request rejection without losing metadata", async () => {
  stubFetch(() => {
    throw null;
  });
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "transport", stage: "request" },
    "model request failed: undefined",
  );
});

test("classifies an undefined request rejection without losing metadata", async () => {
  stubFetch(() => {
    throw undefined;
  });
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "transport", stage: "request" },
    "model request failed: undefined",
  );
});

test("preserves a frozen function-schema Error message and classification", async () => {
  stubFetch(() => envelope('{"summary":"kept"}'));
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({
      system: "system",
      prompt: "prompt",
      schema: () => {
        throw Object.freeze(new Error("shape exploded"));
      },
    }),
    { kind: "schema", stage: "schema" },
    "shape exploded",
  );
});

test("preserves a frozen response-envelope Error message and classification", async () => {
  stubFetch(() => ({
    ok: true,
    status: 200,
    json: async () => {
      throw Object.freeze(new SyntaxError("unexpected envelope token"));
    },
    text: async () => "",
  }));
  const client = createModelClient(syntheticConfig());

  await rejectsWith(
    client.complete({ system: "system", prompt: "prompt" }),
    { kind: "parse", stage: "response" },
    "unexpected envelope token",
  );
});
