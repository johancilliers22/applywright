'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MODEL,
  TARGET,
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  COST_ENVELOPE_INPUT_TOKENS,
  RESERVE_MICRO_USD,
  RATES_USD_PER_MILLION,
  priceUsage,
  usageReceiptSha256,
  stableRequestHash,
  operationForRequest,
} = require('./sonnet-policy.cjs');

const LIMITS = Object.freeze({ maxInputTokens: 1_000_000, maxTotalTokens: 1_004_096 });
const code = expected => error => error && error.code === expected;

function usage(overrides = {}) {
  return {
    input_tokens: 1000,
    output_tokens: 100,
    cache_creation_input_tokens: 200,
    cache_read_input_tokens: 300,
    service_tier: 'standard',
    speed: 'standard',
    inference_geo: 'global',
    cache_creation: {
      ephemeral_5m_input_tokens: 120,
      ephemeral_1h_input_tokens: 80,
    },
    output_tokens_details: { thinking_tokens: 25 },
    server_tool_use: {},
    ...overrides,
  };
}

test('fixed policy constants keep the one-megaton parser boundary and 4096 output', () => {
  assert.equal(MODEL, 'claude-sonnet-5-5');
  assert.equal(TARGET, 'applywright-product');
  assert.equal(MAX_INPUT_TOKENS, 1_000_000);
  assert.equal(MAX_OUTPUT_TOKENS, 4096);
  assert.equal(COST_ENVELOPE_INPUT_TOKENS, 1_048_576);
  assert.notEqual(COST_ENVELOPE_INPUT_TOKENS, MAX_INPUT_TOKENS);
  assert.equal(RESERVE_MICRO_USD, 4_250_000);
  assert.deepEqual(RATES_USD_PER_MILLION, {
    input: 2,
    output: 10,
    cacheWrite5m: 2.5,
    cacheWrite1h: 4,
    cacheRead: 0.1,
  });
});

test('exact known usage prices all cache categories and does not double-count thinking', () => {
  const priced = priceUsage({ model: MODEL, usage: usage() }, LIMITS);
  assert.equal(priced.usageCostEstimateMicroUsd, 3650);
  assert.equal(priced.invoiceCostMicroUsd, null);
  assert.equal(priced.usage.output_tokens_details.thinking_tokens, 25);
  assert.equal(priced.target, TARGET);

  const zeroThinking = priceUsage({
    model: MODEL,
    usage: usage({ output_tokens_details: { thinking_tokens: 0 } }),
  }, LIMITS);
  assert.equal(zeroThinking.usageCostEstimateMicroUsd, priced.usageCostEstimateMicroUsd);
});

test('sub-microUSD arithmetic rounds upward rather than undercounting', () => {
  const priced = priceUsage({
    model: MODEL,
    usage: usage({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 1,
      cache_creation: undefined,
      output_tokens_details: undefined,
      server_tool_use: {},
    }),
  }, LIMITS);
  assert.equal(priced.usageCostEstimateMicroUsd, 1);
});

test('cache creation total must reconcile exactly to the five-minute and one-hour split', () => {
  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({
      cache_creation: {
        ephemeral_5m_input_tokens: 120,
        ephemeral_1h_input_tokens: 79,
      },
    }),
  }, LIMITS), code('USAGE_INVALID'));

  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({ cache_creation: undefined }),
  }, LIMITS), code('USAGE_INVALID'));
});

test('thinking cannot exceed output and usage keys are a closed set', () => {
  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({ output_tokens_details: { thinking_tokens: 101 } }),
  }, LIMITS), code('USAGE_INVALID'));

  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({ cache_creation_input_tokens: 200, surprise: 1 }),
  }, LIMITS), code('USAGE_INVALID'));
});

test('parser input, output, and provider total limits are enforced independently', () => {
  const atInputCeiling = usage({
    input_tokens: 1_000_000,
    output_tokens: 4096,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: undefined,
    output_tokens_details: undefined,
  });
  assert.equal(priceUsage({ model: MODEL, usage: atInputCeiling }, LIMITS)
    .usageCostEstimateMicroUsd, 2_040_960);

  assert.throws(() => priceUsage({
    model: MODEL,
    usage: { ...atInputCeiling, input_tokens: 1_000_001 },
  }, LIMITS), code('USAGE_BOUND_EXCEEDED'));

  assert.throws(() => priceUsage({
    model: MODEL,
    usage: { ...atInputCeiling, output_tokens: 4097 },
  }, LIMITS), code('USAGE_BOUND_EXCEEDED'));

  assert.throws(() => priceUsage({
    model: MODEL,
    usage: atInputCeiling,
  }, { maxInputTokens: 1_000_000, maxTotalTokens: 1_000_000 }), code('USAGE_BOUND_EXCEEDED'));
});

test('unknown or mismatched pricing context is a closed failure', () => {
  assert.throws(() => priceUsage({
    model: 'claude-opus-5-5',
    usage: usage(),
  }, LIMITS), code('MODEL_MISMATCH'));

  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({ service_tier: 'priority' }),
  }, LIMITS), code('PRICING_CONTEXT_UNPROVEN'));

  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({ speed: 'fast' }),
  }, LIMITS), code('PRICING_CONTEXT_UNPROVEN'));

  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({ inference_geo: 'us' }),
  }, LIMITS), code('PRICING_CONTEXT_UNPROVEN'));

  assert.throws(() => priceUsage({ model: MODEL, usage: usage() }, undefined),
    code('CONTEXT_BOUND_UNPROVEN'));
});

test('negative, fractional, and paid-tool usage is rejected', () => {
  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({ input_tokens: -1 }),
  }, LIMITS), code('USAGE_INVALID'));

  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({ output_tokens: 1.5 }),
  }, LIMITS), code('USAGE_INVALID'));

  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({ server_tool_use: { web_search: 1 } }),
  }, LIMITS), code('UNEXPECTED_PAID_TOOL'));
});

test('zero-cost known usage is not admitted as a billable settlement', () => {
  assert.throws(() => priceUsage({
    model: MODEL,
    usage: usage({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: undefined,
      output_tokens_details: undefined,
      server_tool_use: {},
    }),
  }, LIMITS), code('USAGE_COST_UNKNOWN'));
});

test('request hash is stable, excludes auth, and creates one fixed operation id', () => {
  const request = {
    system: 'You are a careful extractor.',
    messages: [{ role: 'user', content: 'Return JSON.' }],
  };
  const one = stableRequestHash(request);
  const two = stableRequestHash({
    messages: [{ content: 'Return JSON.', role: 'user' }],
    system: 'You are a careful extractor.',
  });
  assert.match(one, /^[a-f0-9]{64}$/);
  assert.equal(one, two);
  assert.notEqual(one, stableRequestHash({ ...request, system: 'changed' }));

  const operation = operationForRequest(one);
  assert.equal(operation.id, 'org-f1-' + one.slice(0, 32));
  assert.equal(operation.requestHash, one);
  assert.equal(operation.model, MODEL);
  assert.equal(operation.target, TARGET);
  assert.equal(operation.reserveMicroUsd, 4_250_000);
});

test('usage receipt hash is deterministic and changes when the settlement amount changes', () => {
  const priced = priceUsage({ model: MODEL, usage: usage() }, LIMITS);
  const one = usageReceiptSha256(priced.usage, priced.usageCostEstimateMicroUsd);
  const two = usageReceiptSha256(priced.usage, priced.usageCostEstimateMicroUsd);
  const three = usageReceiptSha256(priced.usage, priced.usageCostEstimateMicroUsd + 1);
  assert.match(one, /^[a-f0-9]{64}$/);
  assert.equal(one, two);
  assert.notEqual(one, three);
});
