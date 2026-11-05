'use strict';

const crypto = require('node:crypto');

const TARGET = 'applywright-product';
const MODEL = 'claude-sonnet-5-5';
const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
const SERVICE_TIER = 'standard_only';
const SPEED = 'standard';
const REGION = 'global';
const MAX_INPUT_TOKENS = 1_000_000;
const MAX_OUTPUT_TOKENS = 4096;
// The 1,048,576 figure is a conservative cost-envelope input, not a parser or
// provider allowance. It is never used to admit a request.
const COST_ENVELOPE_INPUT_TOKENS = 1_048_576;
const RESERVE_MICRO_USD = 4_250_000;
const TARGET_CAP_MICRO_USD = 5_000_000;
const GLOBAL_CAP_MICRO_USD = 190_000_000;
const POLICY_ID = 'applywright-org-f1-sonnet-5-5-2026-10-21';

// Published USD per million tokens. All arithmetic below is in tenths of a
// microUSD, using integer BigInt math, then rounded upward once to microUSD.
const RATES_USD_PER_MILLION = Object.freeze({
  input: 2,
  output: 10,
  cacheWrite5m: 2.5,
  cacheWrite1h: 4,
  cacheRead: 0.1,
});
const RATE_TENTHS_PER_TOKEN = Object.freeze({
  input: 20n,
  output: 100n,
  cacheWrite5m: 25n,
  cacheWrite1h: 40n,
  cacheRead: 1n,
});

const USAGE_KEYS = new Set([
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
  'service_tier',
  'speed',
  'inference_geo',
  'cache_creation',
  'output_tokens_details',
  'server_tool_use',
]);
const CACHE_KEYS = new Set(['ephemeral_5m_input_tokens', 'ephemeral_1h_input_tokens']);
const DETAIL_KEYS = new Set(['thinking_tokens']);

const fault = code => Object.assign(new Error(code), { code });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safeInt = value => Number.isSafeInteger(value) && value >= 0;
const sha256 = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

function contextLimits(limits) {
  if (!isRecord(limits) || !safeInt(limits.maxInputTokens) || limits.maxInputTokens < 1
    || limits.maxInputTokens > MAX_INPUT_TOKENS || !safeInt(limits.maxTotalTokens)
    || limits.maxTotalTokens < 1) {
    throw fault('CONTEXT_BOUND_UNPROVEN');
  }
  return { maxInputTokens: limits.maxInputTokens, maxTotalTokens: limits.maxTotalTokens };
}

function validateUsage(usage, limits) {
  const bounded = contextLimits(limits);
  if (!isRecord(usage)) throw fault('USAGE_INVALID');
  for (const key of Object.keys(usage)) if (!USAGE_KEYS.has(key)) throw fault('USAGE_INVALID');

  for (const key of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens',
    'cache_read_input_tokens']) {
    if (!safeInt(usage[key])) throw fault('USAGE_INVALID');
  }
  if (usage.service_tier !== 'standard' || usage.speed !== 'standard'
    || usage.inference_geo !== 'global') {
    throw fault('PRICING_CONTEXT_UNPROVEN');
  }

  let five = 0;
  let hour = 0;
  if (usage.cache_creation !== undefined) {
    if (!isRecord(usage.cache_creation)) throw fault('USAGE_INVALID');
    for (const key of Object.keys(usage.cache_creation)) {
      if (!CACHE_KEYS.has(key)) throw fault('USAGE_INVALID');
    }
    if (!safeInt(usage.cache_creation.ephemeral_5m_input_tokens)
      || !safeInt(usage.cache_creation.ephemeral_1h_input_tokens)) {
      throw fault('USAGE_INVALID');
    }
    five = usage.cache_creation.ephemeral_5m_input_tokens;
    hour = usage.cache_creation.ephemeral_1h_input_tokens;
  }
  if (five + hour !== usage.cache_creation_input_tokens) throw fault('USAGE_INVALID');

  let thinking = null;
  if (usage.output_tokens_details !== undefined) {
    if (!isRecord(usage.output_tokens_details)) throw fault('USAGE_INVALID');
    for (const key of Object.keys(usage.output_tokens_details)) {
      if (!DETAIL_KEYS.has(key)) throw fault('USAGE_INVALID');
    }
    thinking = usage.output_tokens_details.thinking_tokens;
    if (!safeInt(thinking) || thinking > usage.output_tokens) throw fault('USAGE_INVALID');
  }

  if (usage.server_tool_use !== undefined) {
    if (!isRecord(usage.server_tool_use)) throw fault('USAGE_INVALID');
    for (const value of Object.values(usage.server_tool_use)) {
      if (!safeInt(value)) throw fault('USAGE_INVALID');
      if (value !== 0) throw fault('UNEXPECTED_PAID_TOOL');
    }
  }

  const inputTotal = usage.input_tokens + usage.cache_creation_input_tokens
    + usage.cache_read_input_tokens;
  if (!Number.isSafeInteger(inputTotal)) throw fault('USAGE_INVALID');
  if (inputTotal > bounded.maxInputTokens || inputTotal > MAX_INPUT_TOKENS
    || usage.output_tokens > MAX_OUTPUT_TOKENS
    || inputTotal + usage.output_tokens > bounded.maxTotalTokens) {
    throw fault('USAGE_BOUND_EXCEEDED');
  }

  // output_tokens already includes thinking; thinking is deliberately not
  // added a second time to either the context check or the price.
  const tenths = BigInt(usage.input_tokens) * RATE_TENTHS_PER_TOKEN.input
    + BigInt(usage.output_tokens) * RATE_TENTHS_PER_TOKEN.output
    + BigInt(five) * RATE_TENTHS_PER_TOKEN.cacheWrite5m
    + BigInt(hour) * RATE_TENTHS_PER_TOKEN.cacheWrite1h
    + BigInt(usage.cache_read_input_tokens) * RATE_TENTHS_PER_TOKEN.cacheRead;
  const amount = Number((tenths + 9n) / 10n);
  if (!Number.isSafeInteger(amount) || amount < 1) throw fault('USAGE_COST_UNKNOWN');

  const sanitized = {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens,
    service_tier: usage.service_tier,
    speed: usage.speed,
    inference_geo: usage.inference_geo,
  };
  if (usage.cache_creation !== undefined) {
    sanitized.cache_creation = {
      ephemeral_5m_input_tokens: five,
      ephemeral_1h_input_tokens: hour,
    };
  }
  if (usage.output_tokens_details !== undefined) {
    sanitized.output_tokens_details = { thinking_tokens: thinking };
  }
  if (usage.server_tool_use !== undefined) sanitized.server_tool_use = {};

  return {
    usage: sanitized,
    usageCostEstimateMicroUsd: amount,
    invoiceCostMicroUsd: null,
  };
}

function priceUsage(payload, limits) {
  if (!isRecord(payload) || payload.model !== MODEL) throw fault('MODEL_MISMATCH');
  const priced = validateUsage(payload.usage, limits);
  return {
    target: TARGET,
    model: MODEL,
    usage: priced.usage,
    usageCostEstimateMicroUsd: priced.usageCostEstimateMicroUsd,
    invoiceCostMicroUsd: null,
  };
}

function usageReceiptSha256(usage, usageCostEstimateMicroUsd) {
  if (!isRecord(usage) || !safeInt(usageCostEstimateMicroUsd) || usageCostEstimateMicroUsd < 1) {
    throw fault('USAGE_COST_UNKNOWN');
  }
  return sha256(JSON.stringify({
    target: TARGET,
    model: MODEL,
    usage,
    usageCostEstimateMicroUsd,
  }));
}

function stableRequestHash(request) {
  if (!isRecord(request) || typeof request.system !== 'string' || !Array.isArray(request.messages)) {
    throw fault('REQUEST_INVALID');
  }
  const messages = request.messages.map(message => {
    if (!isRecord(message) || !['user', 'assistant'].includes(message.role)
      || typeof message.content !== 'string') {
      throw fault('REQUEST_INVALID');
    }
    return { role: message.role, content: message.content };
  });
  return sha256(JSON.stringify({
    target: TARGET,
    model: MODEL,
    endpoint: ENDPOINT,
    apiVersion: API_VERSION,
    serviceTier: SERVICE_TIER,
    speed: SPEED,
    region: REGION,
    maxTokens: MAX_OUTPUT_TOKENS,
    system: request.system,
    messages,
  }));
}

function operationForRequest(requestHash) {
  if (!isHash(requestHash)) throw fault('REQUEST_INVALID');
  return Object.freeze({
    id: 'org-f1-' + requestHash.slice(0, 32),
    requestHash,
    model: MODEL,
    target: TARGET,
    reserveMicroUsd: RESERVE_MICRO_USD,
  });
}

module.exports = {
  TARGET,
  MODEL,
  ENDPOINT,
  API_VERSION,
  SERVICE_TIER,
  SPEED,
  REGION,
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  COST_ENVELOPE_INPUT_TOKENS,
  RESERVE_MICRO_USD,
  TARGET_CAP_MICRO_USD,
  GLOBAL_CAP_MICRO_USD,
  POLICY_ID,
  RATES_USD_PER_MILLION,
  isHash,
  safeInt,
  priceUsage,
  usageReceiptSha256,
  stableRequestHash,
  operationForRequest,
};
