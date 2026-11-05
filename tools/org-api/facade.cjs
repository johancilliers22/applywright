'use strict';

const {
  TARGET,
  MODEL,
  ENDPOINT,
  API_VERSION,
  SERVICE_TIER,
  MAX_INPUT_TOKENS,
  MAX_OUTPUT_TOKENS,
  RESERVE_MICRO_USD,
  isHash,
  safeInt,
  priceUsage,
  usageReceiptSha256,
  stableRequestHash,
  operationForRequest,
} = require('./sonnet-policy.cjs');

const BINDING_KIND = 'estate-env-run-claude-org-api';
const GUARD_SHA256 = '2430b6706b4c322f359b4cac3723b3323274c098354e7f4ae0fafb9606ede687';
const STREAM_SHA256 = '0ea76fd22723d5758e6eccc3405cc1dbbce46e6dd07713e17a5b8c2d15210039';
const MAX_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_STREAM_BYTES = 16 * 1024 * 1024;
const MAX_MESSAGES = 1000;
const REQUEST_TIMEOUT_MS = 120_000;

const FIXED_HEADERS = Object.freeze({
  'content-type': 'application/json',
  accept: 'text/event-stream',
  'anthropic-version': API_VERSION,
});
const FORBIDDEN_SAMPLING = new Set(['temperature', 'top_p', 'top_k']);
const FORBIDDEN_TOOLS = new Set(['tools', 'tool_choice', 'server_tool_use']);
const FIXED_MAX_TOKEN_KEYS = new Set(['max_tokens', 'maxOutputTokens']);
const ALLOWED_REQUEST_KEYS = new Set(['system', 'messages', 'maxTokens']);

const fault = code => Object.assign(new Error(code), { code });
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, extra = {}) => Object.assign({ ok: false, code }, extra);

function validateBinding(binding) {
  if (!isRecord(binding) || binding.kind !== BINDING_KIND || binding.qualified !== true
    || binding.guardSha256 !== GUARD_SHA256 || binding.streamSha256 !== STREAM_SHA256
    || !isHash(binding.sourcePricingRelease)) {
    throw fault('ORG_ROUTE_UNAVAILABLE');
  }
  if (!isRecord(binding.reconciliation) || binding.reconciliation.state !== 'RECONCILED'
    || !isHash(binding.reconciliation.proofSha256)) {
    throw fault('ORG_ROUTE_UNAVAILABLE');
  }
  if (typeof binding.ledgerPath !== 'string' || !binding.ledgerPath.startsWith('/')
    || binding.ledgerPath.startsWith('/mnt/') || binding.ledgerPath.includes('\\')
    || binding.ledgerPath.includes('..') || !binding.ledgerPath.endsWith('.json')) {
    throw fault('ORG_ROUTE_UNAVAILABLE');
  }
  if (!isRecord(binding.guard)
    || ['readLedger', 'reserve', 'complete', 'markUncertain']
      .some(name => typeof binding.guard[name] !== 'function')) {
    throw fault('ORG_ROUTE_UNAVAILABLE');
  }
  if (!isRecord(binding.stream) || typeof binding.stream.consumeMessageStream !== 'function') {
    throw fault('ORG_ROUTE_UNAVAILABLE');
  }
  if (!isRecord(binding.context) || !safeInt(binding.context.maxInputTokens)
    || binding.context.maxInputTokens < 1 || binding.context.maxInputTokens > MAX_INPUT_TOKENS
    || !safeInt(binding.context.maxTotalTokens) || binding.context.maxTotalTokens < 1
    || typeof binding.context.countInputTokens !== 'function'
    || !isHash(binding.context.proofSha256)) {
    throw fault('ORG_ROUTE_UNAVAILABLE');
  }
  if (!isRecord(binding.credential)
    || binding.credential.selectedName !== 'ANTHROPIC_ORG_API_KEY'
    || binding.credential.genericAliasPresent !== false
    || typeof binding.credential.present !== 'function'
    || typeof binding.credential.authHeaders !== 'function') {
    throw fault('ORG_ROUTE_UNAVAILABLE');
  }
  if (typeof binding.fetch !== 'function') throw fault('ORG_ROUTE_UNAVAILABLE');
  if (binding.resultStore !== undefined
    && (!isRecord(binding.resultStore) || typeof binding.resultStore.get !== 'function')) {
    throw fault('ORG_ROUTE_UNAVAILABLE');
  }
  if (binding.validateProductResult !== undefined
    && typeof binding.validateProductResult !== 'function') {
    throw fault('ORG_ROUTE_UNAVAILABLE');
  }
}

function normalizeRequest(request, context) {
  if (!isRecord(request)) throw fault('REQUEST_INVALID');
  for (const key of Object.keys(request)) {
    if (FORBIDDEN_SAMPLING.has(key)) throw fault('SAMPLING_FORBIDDEN');
    if (FORBIDDEN_TOOLS.has(key)) throw fault('TOOL_SELECTOR_FORBIDDEN');
    if (FIXED_MAX_TOKEN_KEYS.has(key)) throw fault('MAX_TOKENS_FIXED');
    if (!ALLOWED_REQUEST_KEYS.has(key)) throw fault('REQUEST_UNKNOWN_SELECTOR');
  }

  const system = request.system === undefined ? '' : request.system;
  if (typeof system !== 'string') throw fault('REQUEST_INVALID');
  if (!Array.isArray(request.messages) || request.messages.length < 1
    || request.messages.length > MAX_MESSAGES) {
    throw fault('REQUEST_INVALID');
  }
  const messages = request.messages.map(message => {
    if (!isRecord(message) || Object.keys(message).length !== 2
      || !Object.hasOwn(message, 'role') || !Object.hasOwn(message, 'content')
      || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      throw fault('REQUEST_INVALID');
    }
    return { role: message.role, content: message.content };
  });
  if (request.maxTokens !== undefined && request.maxTokens !== MAX_OUTPUT_TOKENS) {
    throw fault('MAX_TOKENS_FIXED');
  }

  let inputTokens;
  try {
    inputTokens = context.countInputTokens({ system, messages });
  } catch {
    throw fault('CONTEXT_COUNT_UNAVAILABLE');
  }
  if (!safeInt(inputTokens)) throw fault('CONTEXT_COUNT_UNAVAILABLE');
  if (inputTokens > context.maxInputTokens
    || inputTokens + MAX_OUTPUT_TOKENS > context.maxTotalTokens) {
    throw fault('REQUEST_TOO_LARGE');
  }

  const body = {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: true,
    service_tier: SERVICE_TIER,
    messages,
  };
  if (system) body.system = system;
  const bodyText = JSON.stringify(body);
  if (Buffer.byteLength(bodyText, 'utf8') > MAX_REQUEST_BYTES) throw fault('REQUEST_TOO_LARGE');

  const requestHash = stableRequestHash({ system, messages });
  return { operation: operationForRequest(requestHash), bodyText };
}

function getAuthHeaders(credential) {
  let auth;
  try {
    auth = credential.authHeaders();
  } catch {
    throw fault('ORG_CREDENTIAL_UNAVAILABLE');
  }
  if (!isRecord(auth)) throw fault('ORG_CREDENTIAL_UNAVAILABLE');
  const keys = Object.keys(auth);
  if (keys.length !== 1 || keys[0].toLowerCase() !== 'x-api-key') {
    throw fault('ORG_CREDENTIAL_UNAVAILABLE');
  }
  const value = auth[keys[0]];
  if (typeof value !== 'string' || value.length < 1 || value.length > 4096
    || /[\r\n]/.test(value)) {
    throw fault('ORG_CREDENTIAL_UNAVAILABLE');
  }
  return { 'x-api-key': value };
}

function matchesEntry(entry, operation) {
  return isRecord(entry) && entry.requestHash === operation.requestHash
    && entry.model === MODEL && entry.target === TARGET;
}

function reasonCode(value, fallback) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : fallback;
}

function uncertainAccounting() {
  return {
    target: TARGET,
    model: MODEL,
    reservedMicroUsd: RESERVE_MICRO_USD,
    usageCostEstimateMicroUsd: null,
    invoiceCostMicroUsd: null,
  };
}

function settledAccounting(usageCostEstimateMicroUsd) {
  return {
    target: TARGET,
    model: MODEL,
    usageCostEstimateMicroUsd,
    invoiceCostMicroUsd: null,
  };
}

function mapLedgerError(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  if (code.startsWith('LEDGER_') || code === 'CYCLE_EXPIRED'
    || code === 'RECONCILIATION_STALE' || code === 'BUDGET_UNRECONCILED') {
    return 'ORG_LEDGER_UNAVAILABLE';
  }
  return 'ORG_RECONCILIATION_HOLD';
}

function mapReserveError(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  if (code === 'OPERATION_ALREADY_PENDING') return 'ORG_OPERATION_PENDING';
  if (code === 'OPERATION_MISMATCH') return 'ORG_OPERATION_MISMATCH';
  if (code === 'BUDGET_UNCERTAIN') return 'ORG_BUDGET_UNCERTAIN';
  if (code.startsWith('LEDGER_') || code === 'CYCLE_EXPIRED'
    || code === 'RECONCILIATION_STALE') return 'ORG_LEDGER_UNAVAILABLE';
  if (code.startsWith('BUDGET_') || code.startsWith('OPERATION_')) return 'ORG_BUDGET_UNAVAILABLE';
  return 'ORG_RECONCILIATION_HOLD';
}

async function hold(binding, operation, reason) {
  try {
    await binding.guard.markUncertain(binding.ledgerPath, operation.id, reasonCode(reason, 'STREAM_UNCERTAIN'));
  } catch {
    return fail('ORG_RECONCILIATION_HOLD', {
      reason: 'UNCERTAINTY_WRITE_FAILED',
      uncertain: true,
      accounting: uncertainAccounting(),
    });
  }
  return fail('ORG_DISPATCH_UNCERTAIN', {
    reason: reasonCode(reason, 'STREAM_UNCERTAIN'),
    uncertain: true,
    accounting: uncertainAccounting(),
  });
}

async function replayResult(binding, operation, entry) {
  if (!matchesEntry(entry, operation) || entry.status !== 'completed'
    || !safeInt(entry.usageCostEstimateMicroUsd) || entry.usageCostEstimateMicroUsd < 1) {
    return fail('ORG_OPERATION_MISMATCH');
  }
  const accounting = settledAccounting(entry.usageCostEstimateMicroUsd);
  if (!binding.resultStore) {
    return fail('RESULT_UNAVAILABLE_NO_REDISPATCH', {
      replayed: true, settled: true, accounting,
    });
  }
  let stored;
  try {
    stored = await binding.resultStore.get({
      operationId: operation.id,
      requestHash: operation.requestHash,
      model: MODEL,
    });
  } catch {
    return fail('RESULT_UNAVAILABLE_NO_REDISPATCH', {
      replayed: true, settled: true, accounting,
    });
  }
  if (!isRecord(stored) || stored.requestHash !== operation.requestHash || stored.model !== MODEL
    || typeof stored.text !== 'string' || Buffer.byteLength(stored.text, 'utf8') > MAX_TEXT_BYTES) {
    return fail('RESULT_UNAVAILABLE_NO_REDISPATCH', {
      replayed: true, settled: true, accounting,
    });
  }
  // Replay must prove the same successful completion and application
  // acceptance as the fresh path before returning stored text.
  const truncated = stored.truncated === true || stored.stopReason !== 'end_turn';
  if (truncated) {
    return fail('RESULT_UNAVAILABLE_NO_REDISPATCH', {
      reason: 'COMPLETION_UNPROVEN',
      replayed: true,
      settled: true,
      accounting,
    });
  }
  const stopReason = stored.stopReason;
  const messageId = typeof stored.messageId === 'string' && stored.messageId.length <= 200
    ? stored.messageId : null;
  let applicationRejected = false;
  if (binding.validateProductResult) {
    try {
      await binding.validateProductResult({
        text: stored.text,
        stopReason,
        truncated: false,
      });
    } catch {
      applicationRejected = true;
    }
  }
  if (applicationRejected) {
    return fail('APPLICATION_RESULT_REJECTED', {
      reason: 'APPLICATION_RESULT_REJECTED',
      replayed: true,
      settled: true,
      accounting,
    });
  }
  return {
    ok: true,
    replayed: true,
    text: stored.text,
    stopReason,
    truncated: false,
    messageId,
    servingIdentity: 'STORED_PRODUCT_RESULT',
    accounting,
  };
}

function createFacade(binding) {
  validateBinding(binding);

  return {
    async complete(request) {
      let normalized;
      try {
        normalized = normalizeRequest(request, binding.context);
      } catch (error) {
        return fail(error && error.code ? error.code : 'REQUEST_INVALID');
      }
      const { operation, bodyText } = normalized;

      let snapshot;
      try {
        snapshot = await binding.guard.readLedger(binding.ledgerPath);
      } catch (error) {
        return fail(mapLedgerError(error));
      }
      if (!isRecord(snapshot) || !isRecord(snapshot.entries)) return fail('ORG_LEDGER_UNAVAILABLE');
      const existing = Object.hasOwn(snapshot.entries, operation.id)
        ? snapshot.entries[operation.id] : null;
      if (existing) {
        if (!matchesEntry(existing, operation)) return fail('ORG_OPERATION_MISMATCH');
        if (existing.status === 'completed') return replayResult(binding, operation, existing);
        if (existing.status === 'reserved') return fail('ORG_OPERATION_PENDING');
        if (existing.status === 'uncertain') return fail('ORG_BUDGET_UNCERTAIN');
        return fail('ORG_LEDGER_UNAVAILABLE');
      }

      let present;
      try {
        present = binding.credential.present();
      } catch {
        present = false;
      }
      if (present !== true) return fail('ORG_CREDENTIAL_UNAVAILABLE');
      let auth;
      try {
        auth = getAuthHeaders(binding.credential);
      } catch (error) {
        return fail(error && error.code ? error.code : 'ORG_CREDENTIAL_UNAVAILABLE');
      }

      let reserved;
      try {
        reserved = await binding.guard.reserve(binding.ledgerPath, operation);
      } catch (error) {
        return fail(mapReserveError(error));
      }
      if (!isRecord(reserved)) return fail('ORG_RECONCILIATION_HOLD');
      if (reserved.replayed) {
        if (!isRecord(reserved.entry) || !matchesEntry(reserved.entry, operation)) {
          return fail('ORG_OPERATION_MISMATCH');
        }
        return replayResult(binding, operation, reserved.entry);
      }
      if (!isRecord(reserved.entry) || !matchesEntry(reserved.entry, operation)
        || reserved.entry.status !== 'reserved') {
        return fail('ORG_RECONCILIATION_HOLD');
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let stream;
      try {
        let response;
        try {
          response = await binding.fetch(ENDPOINT, {
            method: 'POST',
            headers: { ...FIXED_HEADERS, ...auth },
            body: bodyText,
            redirect: 'manual',
            signal: controller.signal,
          });
        } catch (error) {
          return await hold(binding, operation,
            error && error.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'DISPATCH_AMBIGUOUS');
        }
        if (!isRecord(response) || !safeInt(response.status)) {
          return await hold(binding, operation, 'UPSTREAM_PROTOCOL');
        }
        if (response.status >= 300 && response.status < 400) {
          return await hold(binding, operation, 'UPSTREAM_REDIRECT_REFUSED');
        }
        if (response.status !== 200) {
          return await hold(binding, operation, 'UPSTREAM_HTTP_ERROR');
        }
        if (!response.body) return await hold(binding, operation, 'STREAM_INCOMPLETE');
        try {
          stream = await binding.stream.consumeMessageStream(response.body, {
            expectedModel: MODEL,
            maxTokens: MAX_OUTPUT_TOKENS,
            maxBytes: MAX_STREAM_BYTES,
          });
        } catch (error) {
          return await hold(binding, operation, reasonCode(error && error.code, 'STREAM_UNCERTAIN'));
        }
      } finally {
        clearTimeout(timer);
      }

      if (!isRecord(stream) || stream.reportedModel !== MODEL) {
        return await hold(binding, operation, 'MODEL_MISMATCH');
      }
      if (typeof stream.text !== 'string' || typeof stream.stopReason !== 'string'
        || !isRecord(stream.usage)) {
        return await hold(binding, operation, 'STREAM_PROTOCOL');
      }
      if (Buffer.byteLength(stream.text, 'utf8') > MAX_TEXT_BYTES) {
        return await hold(binding, operation, 'STREAM_TOO_LARGE');
      }

      let priced;
      try {
        priced = priceUsage({ model: stream.reportedModel, usage: stream.usage }, {
          maxInputTokens: binding.context.maxInputTokens,
          maxTotalTokens: binding.context.maxTotalTokens,
        });
      } catch (error) {
        return await hold(binding, operation, reasonCode(error && error.code, 'USAGE_UNCERTAIN'));
      }

      let receipt;
      try {
        receipt = usageReceiptSha256(priced.usage, priced.usageCostEstimateMicroUsd);
      } catch {
        return await hold(binding, operation, 'USAGE_RECEIPT_UNAVAILABLE');
      }

      let completed;
      try {
        completed = await binding.guard.complete(binding.ledgerPath, operation.id, {
          usageCostEstimateMicroUsd: priced.usageCostEstimateMicroUsd,
          usageReceiptSha256: receipt,
          usage: priced.usage,
        });
      } catch {
        return fail('ORG_RECONCILIATION_HOLD', {
          reason: 'SETTLEMENT_WRITE_FAILED',
          settled: false,
          uncertain: true,
          accounting: uncertainAccounting(),
        });
      }
      if (!isRecord(completed) || completed.status !== 'completed') {
        return fail('ORG_RECONCILIATION_HOLD', {
          reason: 'SETTLEMENT_UNCONFIRMED',
          settled: false,
          uncertain: true,
          accounting: uncertainAccounting(),
        });
      }

      const truncated = stream.truncated === true || stream.stopReason !== 'end_turn';
      let applicationRejected = false;
      if (binding.validateProductResult) {
        try {
          await binding.validateProductResult({
            text: stream.text,
            stopReason: stream.stopReason,
            truncated,
          });
        } catch {
          applicationRejected = true;
        }
      }

      const accounting = settledAccounting(priced.usageCostEstimateMicroUsd);
      if (truncated) {
        return fail('OUTPUT_TRUNCATED', {
          reason: 'STOP_REASON_NOT_END_TURN', settled: true, accounting,
        });
      }
      if (applicationRejected) {
        return fail('APPLICATION_RESULT_REJECTED', {
          reason: 'APPLICATION_RESULT_REJECTED', settled: true, accounting,
        });
      }
      return {
        ok: true,
        replayed: false,
        text: stream.text,
        stopReason: stream.stopReason,
        truncated: false,
        messageId: typeof stream.messageId === 'string' ? stream.messageId : null,
        servingIdentity: typeof stream.servingIdentity === 'string'
          ? stream.servingIdentity : 'UNKNOWN',
        usage: priced.usage,
        accounting,
      };
    },
  };
}

module.exports = {
  BINDING_KIND,
  GUARD_SHA256,
  STREAM_SHA256,
  FIXED_HEADERS,
  validateBinding,
  createFacade,
};
