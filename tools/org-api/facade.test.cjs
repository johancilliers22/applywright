'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BINDING_KIND,
  GUARD_SHA256,
  STREAM_SHA256,
  createFacade,
} = require('./facade.cjs');
const {
  MODEL,
  TARGET,
  ENDPOINT,
  MAX_OUTPUT_TOKENS,
  stableRequestHash,
} = require('./sonnet-policy.cjs');

const KEY = 'test-org-key-not-real';
const SOURCE_RELEASE = '9d6cc5cca7eb0b1195b969eda769467b66ba562e13e6d5a0a5b66a0a9e66e0d2';
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

function request(extra = {}) {
  return {
    system: 'Fixed owner-controlled system text.',
    messages: [{ role: 'user', content: 'Bounded product request.' }],
    ...extra,
  };
}

function requestHash(value = request()) {
  return stableRequestHash({ system: value.system || '', messages: value.messages });
}

function completedEntry(value = request()) {
  const hash = requestHash(value);
  return {
    requestHash: hash,
    model: MODEL,
    target: TARGET,
    status: 'completed',
    usageCostEstimateMicroUsd: 3650,
  };
}

function fakeBinding() {
  const calls = {
    readLedger: 0,
    reserve: 0,
    complete: 0,
    markUncertain: 0,
    fetch: 0,
    stream: 0,
    present: 0,
    authHeaders: 0,
    count: 0,
  };
  const binding = {
    kind: BINDING_KIND,
    qualified: true,
    guardSha256: GUARD_SHA256,
    streamSha256: STREAM_SHA256,
    sourcePricingRelease: SOURCE_RELEASE,
    reconciliation: {
      state: 'RECONCILED',
      proofSha256: 'b'.repeat(64),
    },
    ledgerPath: '/home/johan/.local/share/estate/org-f1-fake-ledger.json',
    context: {
      maxInputTokens: 1_000_000,
      maxTotalTokens: 1_004_096,
      proofSha256: 'c'.repeat(64),
      countInputTokens: () => {
        calls.count += 1;
        return 1000;
      },
    },
    credential: {
      selectedName: 'ANTHROPIC_ORG_API_KEY',
      genericAliasPresent: false,
      present: () => {
        calls.present += 1;
        return true;
      },
      authHeaders: () => {
        calls.authHeaders += 1;
        return { 'x-api-key': KEY };
      },
    },
    guard: {
      readLedger: async () => {
        calls.readLedger += 1;
        return { entries: {} };
      },
      reserve: async (path, operation) => {
        calls.reserve += 1;
        return {
          replayed: false,
          entry: { ...operation, status: 'reserved' },
        };
      },
      complete: async (path, id, result) => {
        calls.complete += 1;
        return { id, status: 'completed', ...result };
      },
      markUncertain: async (path, id, reason) => {
        calls.markUncertain += 1;
        return { id, status: 'uncertain', reason };
      },
    },
    stream: {
      consumeMessageStream: async (body, options) => {
        calls.stream += 1;
        calls.streamBody = body;
        calls.streamOptions = options;
        return {
          messageId: 'msg_fake_01',
          reportedModel: MODEL,
          stopReason: 'end_turn',
          text: '{"ok":true}',
          usage: usage(),
          truncated: false,
          servingIdentity: 'PROVIDER_REPORTED_NOT_INDEPENDENTLY_ATTESTED',
        };
      },
    },
    fetch: async (url, init) => {
      calls.fetch += 1;
      calls.url = url;
      calls.init = init;
      return { status: 200, body: { fake: true } };
    },
    resultStore: {
      get: async () => null,
    },
    calls,
  };
  return binding;
}

test('new operation sends one fixed Sonnet request and settles once', async () => {
  const binding = fakeBinding();
  const result = await createFacade(binding).complete(request());

  assert.equal(result.ok, true);
  assert.equal(result.replayed, false);
  assert.equal(result.truncated, false);
  assert.equal(result.accounting.usageCostEstimateMicroUsd, 3650);
  assert.equal(result.accounting.invoiceCostMicroUsd, null);
  assert.equal(binding.calls.reserve, 1);
  assert.equal(binding.calls.fetch, 1);
  assert.equal(binding.calls.stream, 1);
  assert.equal(binding.calls.complete, 1);
  assert.equal(binding.calls.markUncertain, 0);

  assert.equal(binding.calls.url, ENDPOINT);
  assert.equal(binding.calls.init.method, 'POST');
  assert.equal(binding.calls.init.redirect, 'manual');
  assert.equal(binding.calls.init.headers['x-api-key'], KEY);
  assert.equal(binding.calls.init.headers['anthropic-version'], '2026-10-21');
  assert.equal(binding.calls.init.headers['content-type'], 'application/json');
  assert.equal(binding.calls.init.headers.accept, 'text/event-stream');
  assert.equal(Object.hasOwn(binding.calls.init.headers, 'authorization'), false);

  const body = JSON.parse(binding.calls.init.body);
  assert.equal(body.model, MODEL);
  assert.equal(body.max_tokens, MAX_OUTPUT_TOKENS);
  assert.equal(body.stream, true);
  assert.equal(body.service_tier, 'standard_only');
  assert.equal(body.system, 'Fixed owner-controlled system text.');
  assert.equal(Object.hasOwn(body, 'temperature'), false);
  assert.equal(Object.hasOwn(body, 'top_p'), false);
  assert.equal(Object.hasOwn(body, 'top_k'), false);
  assert.equal(Object.hasOwn(body, 'tools'), false);
  assert.equal(binding.calls.streamOptions.expectedModel, MODEL);
  assert.equal(binding.calls.streamOptions.maxTokens, 4096);
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test('sampling overrides are refused before reserve or egress', async () => {
  for (const [field, value] of [['temperature', 0], ['top_p', 1], ['top_k', 1]]) {
    const binding = fakeBinding();
    const result = await createFacade(binding).complete(request({ [field]: value }));
    assert.equal(result.code, 'SAMPLING_FORBIDDEN');
    assert.equal(binding.calls.reserve, 0);
    assert.equal(binding.calls.fetch, 0);
    assert.equal(binding.calls.stream, 0);
  }
});

test('caller selectors and variable output ceilings are refused', async () => {
  const cases = [
    [{ model: 'claude-opus-5-5' }, 'REQUEST_UNKNOWN_SELECTOR'],
    [{ target: 'M2' }, 'REQUEST_UNKNOWN_SELECTOR'],
    [{ ledger: '/tmp/attacker.json' }, 'REQUEST_UNKNOWN_SELECTOR'],
    [{ program: 'other' }, 'REQUEST_UNKNOWN_SELECTOR'],
    [{ endpoint: 'https://example.invalid' }, 'REQUEST_UNKNOWN_SELECTOR'],
    [{ price: 0 }, 'REQUEST_UNKNOWN_SELECTOR'],
    [{ tools: [] }, 'TOOL_SELECTOR_FORBIDDEN'],
    [{ tool_choice: 'auto' }, 'TOOL_SELECTOR_FORBIDDEN'],
    [{ maxTokens: 8192 }, 'MAX_TOKENS_FIXED'],
    [{ max_tokens: 4096 }, 'MAX_TOKENS_FIXED'],
  ];
  for (const [extra, expected] of cases) {
    const binding = fakeBinding();
    const result = await createFacade(binding).complete(request(extra));
    assert.equal(result.code, expected);
    assert.equal(binding.calls.reserve, 0);
    assert.equal(binding.calls.fetch, 0);
  }
});

test('request context is checked against the parser and provider total before reserve', async () => {
  const overParser = fakeBinding();
  overParser.context.countInputTokens = () => 1_000_001;
  const tooMany = await createFacade(overParser).complete(request());
  assert.equal(tooMany.code, 'REQUEST_TOO_LARGE');
  assert.equal(overParser.calls.reserve, 0);

  const tightTotal = fakeBinding();
  tightTotal.context.maxTotalTokens = 1_000_000;
  tightTotal.context.countInputTokens = () => 1_000_000;
  const noRoom = await createFacade(tightTotal).complete(request());
  assert.equal(noRoom.code, 'REQUEST_TOO_LARGE');
  assert.equal(tightTotal.calls.reserve, 0);

  const noCount = fakeBinding();
  noCount.context.countInputTokens = () => {
    throw new Error('counter unavailable');
  };
  const unavailable = await createFacade(noCount).complete(request());
  assert.equal(unavailable.code, 'CONTEXT_COUNT_UNAVAILABLE');
  assert.equal(noCount.calls.reserve, 0);
});

test('missing or unqualified binding is ORG_ROUTE_UNAVAILABLE before any use', () => {
  assert.throws(() => createFacade(null), code('ORG_ROUTE_UNAVAILABLE'));
  assert.throws(() => createFacade({ ...fakeBinding(), qualified: false }),
    code('ORG_ROUTE_UNAVAILABLE'));
  assert.throws(() => createFacade({ ...fakeBinding(), guardSha256: '0'.repeat(64) }),
    code('ORG_ROUTE_UNAVAILABLE'));
  assert.throws(() => createFacade({ ...fakeBinding(), streamSha256: '0'.repeat(64) }),
    code('ORG_ROUTE_UNAVAILABLE'));
  assert.throws(() => createFacade({ ...fakeBinding(), ledgerPath: 'C:/tmp/ledger.json' }),
    code('ORG_ROUTE_UNAVAILABLE'));

  const wrongKey = fakeBinding();
  wrongKey.credential.selectedName = 'ANTHROPIC_API_KEY';
  assert.throws(() => createFacade(wrongKey), code('ORG_ROUTE_UNAVAILABLE'));

  const aliasPresent = fakeBinding();
  aliasPresent.credential.genericAliasPresent = true;
  assert.throws(() => createFacade(aliasPresent), code('ORG_ROUTE_UNAVAILABLE'));

  const stale = fakeBinding();
  stale.reconciliation.state = 'STALE';
  assert.throws(() => createFacade(stale), code('ORG_ROUTE_UNAVAILABLE'));

  const missingGuard = fakeBinding();
  delete missingGuard.guard.reserve;
  assert.throws(() => createFacade(missingGuard), code('ORG_ROUTE_UNAVAILABLE'));
});

test('stale reconciliation and ledger read failures stop before reserve', async () => {
  for (const [ledgerCode, expected] of [
    ['RECONCILIATION_STALE', 'ORG_LEDGER_UNAVAILABLE'],
    ['LEDGER_INVALID', 'ORG_LEDGER_UNAVAILABLE'],
  ]) {
    const binding = fakeBinding();
    binding.guard.readLedger = async () => {
      throw Object.assign(new Error(ledgerCode), { code: ledgerCode });
    };
    const result = await createFacade(binding).complete(request());
    assert.equal(result.code, expected);
    assert.equal(binding.calls.reserve, 0);
    assert.equal(binding.calls.fetch, 0);
  }
});

test('absent selected credential leaves no new reservation and no egress', async () => {
  const binding = fakeBinding();
  binding.credential.present = () => {
    binding.calls.present += 1;
    return false;
  };
  const result = await createFacade(binding).complete(request());
  assert.equal(result.code, 'ORG_CREDENTIAL_UNAVAILABLE');
  assert.equal(binding.calls.present, 1);
  assert.equal(binding.calls.authHeaders, 0);
  assert.equal(binding.calls.reserve, 0);
  assert.equal(binding.calls.fetch, 0);
  assert.equal(binding.calls.stream, 0);
});

test('a completed accounting entry replays a stored product result without reserve or transport', async () => {
  const binding = fakeBinding();
  const entry = completedEntry();
  const hash = entry.requestHash;
  binding.guard.readLedger = async () => {
    binding.calls.readLedger += 1;
    return {
      entries: {
        ['org-f1-' + hash.slice(0, 32)]: entry,
      },
    };
  };
  binding.resultStore = {
    get: async ({ requestHash: storedHash }) => ({
      requestHash: storedHash,
      model: MODEL,
      text: 'stored product text',
      stopReason: 'end_turn',
      truncated: false,
    }),
  };
  let validatorCalls = 0;
  binding.validateProductResult = async payload => {
    validatorCalls += 1;
    assert.deepEqual(payload, {
      text: 'stored product text',
      stopReason: 'end_turn',
      truncated: false,
    });
  };

  const result = await createFacade(binding).complete(request());
  assert.equal(result.ok, true);
  assert.equal(result.replayed, true);
  assert.equal(result.text, 'stored product text');
  assert.equal(result.stopReason, 'end_turn');
  assert.equal(result.truncated, false);
  assert.equal(validatorCalls, 1);
  assert.equal(binding.calls.reserve, 0);
  assert.equal(binding.calls.present, 0);
  assert.equal(binding.calls.authHeaders, 0);
  assert.equal(binding.calls.fetch, 0);
  assert.equal(binding.calls.stream, 0);
  assert.equal(binding.calls.complete, 0);
  assert.equal(binding.calls.markUncertain, 0);
});

test('completed replay without a matching stored result never redispatches', async () => {
  const binding = fakeBinding();
  const entry = completedEntry();
  const hash = entry.requestHash;
  binding.guard.readLedger = async () => ({
    entries: { ['org-f1-' + hash.slice(0, 32)]: entry },
  });
  binding.resultStore = { get: async () => null };

  const result = await createFacade(binding).complete(request());
  assert.equal(result.code, 'RESULT_UNAVAILABLE_NO_REDISPATCH');
  assert.equal(result.replayed, true);
  assert.equal(result.settled, true);
  assert.equal(result.accounting.usageCostEstimateMicroUsd, 3650);
  assert.equal(binding.calls.reserve, 0);
  assert.equal(binding.calls.fetch, 0);
  assert.equal(binding.calls.stream, 0);
});

test('stored replay rejected by the validator closes without redispatch or new calls', async () => {
  for (const validator of [
    () => {
      throw new Error('invalid stored application result');
    },
    async () => {
      throw new Error('async invalid stored application result');
    },
  ]) {
    const binding = fakeBinding();
    const entry = completedEntry();
    const hash = entry.requestHash;
    binding.guard.readLedger = async () => {
      binding.calls.readLedger += 1;
      return {
        entries: {
          ['org-f1-' + hash.slice(0, 32)]: entry,
        },
      };
    };
    binding.resultStore = {
      get: async ({ requestHash: storedHash }) => ({
        requestHash: storedHash,
        model: MODEL,
        text: 'stored product text',
        stopReason: 'end_turn',
        truncated: false,
      }),
    };
    binding.validateProductResult = validator;

    const result = await createFacade(binding).complete(request());
    assert.equal(result.ok, false);
    assert.equal(result.code, 'APPLICATION_RESULT_REJECTED');
    assert.equal(result.reason, 'APPLICATION_RESULT_REJECTED');
    assert.equal(result.replayed, true);
    assert.equal(result.settled, true);
    assert.equal(result.accounting.usageCostEstimateMicroUsd, 3650);
    assert.equal(Object.hasOwn(result, 'text'), false);
    assert.equal(binding.calls.readLedger, 1);
    assert.equal(binding.calls.reserve, 0);
    assert.equal(binding.calls.present, 0);
    assert.equal(binding.calls.authHeaders, 0);
    assert.equal(binding.calls.fetch, 0);
    assert.equal(binding.calls.stream, 0);
    assert.equal(binding.calls.complete, 0);
    assert.equal(binding.calls.markUncertain, 0);
  }
});

test('stored replay without proven completion closes with completed accounting', async () => {
  for (const metadata of [
    { stopReason: undefined, truncated: false },
    { stopReason: 'end_turn', truncated: true },
  ]) {
    const binding = fakeBinding();
    const entry = completedEntry();
    const hash = entry.requestHash;
    binding.guard.readLedger = async () => {
      binding.calls.readLedger += 1;
      return {
        entries: {
          ['org-f1-' + hash.slice(0, 32)]: entry,
        },
      };
    };
    binding.resultStore = {
      get: async ({ requestHash: storedHash }) => ({
        requestHash: storedHash,
        model: MODEL,
        text: 'stored product text',
        ...metadata,
      }),
    };
    let validatorCalls = 0;
    binding.validateProductResult = async () => {
      validatorCalls += 1;
      throw new Error('unproven completion must not reach validator');
    };

    const result = await createFacade(binding).complete(request());
    assert.equal(result.ok, false);
    assert.equal(result.code, 'RESULT_UNAVAILABLE_NO_REDISPATCH');
    assert.equal(result.reason, 'COMPLETION_UNPROVEN');
    assert.equal(result.replayed, true);
    assert.equal(result.settled, true);
    assert.equal(result.accounting.usageCostEstimateMicroUsd, 3650);
    assert.equal(Object.hasOwn(result, 'text'), false);
    assert.equal(validatorCalls, 0);
    assert.equal(binding.calls.readLedger, 1);
    assert.equal(binding.calls.reserve, 0);
    assert.equal(binding.calls.present, 0);
    assert.equal(binding.calls.authHeaders, 0);
    assert.equal(binding.calls.fetch, 0);
    assert.equal(binding.calls.stream, 0);
    assert.equal(binding.calls.complete, 0);
    assert.equal(binding.calls.markUncertain, 0);
  }
});

test('existing pending or uncertain entries are closed without reserve', async () => {
  for (const [status, expected] of [
    ['reserved', 'ORG_OPERATION_PENDING'],
    ['uncertain', 'ORG_BUDGET_UNCERTAIN'],
  ]) {
    const binding = fakeBinding();
    const entry = { ...completedEntry(), status };
    const hash = entry.requestHash;
    binding.guard.readLedger = async () => ({
      entries: { ['org-f1-' + hash.slice(0, 32)]: entry },
    });
    const result = await createFacade(binding).complete(request());
    assert.equal(result.code, expected);
    assert.equal(binding.calls.reserve, 0);
    assert.equal(binding.calls.fetch, 0);
  }
});

test('a reserve race that becomes completed returns only the stored result', async () => {
  const binding = fakeBinding();
  const entry = completedEntry();
  binding.guard.reserve = async () => {
    binding.calls.reserve += 1;
    return { replayed: true, entry };
  };
  binding.resultStore = {
    get: async ({ requestHash: storedHash }) => ({
      requestHash: storedHash,
      model: MODEL,
      text: 'stored race result',
      stopReason: 'end_turn',
      truncated: false,
    }),
  };
  let validatorCalls = 0;
  binding.validateProductResult = async payload => {
    validatorCalls += 1;
    assert.deepEqual(payload, {
      text: 'stored race result',
      stopReason: 'end_turn',
      truncated: false,
    });
  };

  const result = await createFacade(binding).complete(request());
  assert.equal(result.ok, true);
  assert.equal(result.replayed, true);
  assert.equal(result.text, 'stored race result');
  assert.equal(result.stopReason, 'end_turn');
  assert.equal(result.truncated, false);
  assert.equal(validatorCalls, 1);
  assert.equal(binding.calls.reserve, 1);
  assert.equal(binding.calls.fetch, 0);
  assert.equal(binding.calls.stream, 0);
  assert.equal(binding.calls.complete, 0);
  assert.equal(binding.calls.markUncertain, 0);
});

test('a reserve race with unproven completion closes after one reserve and no egress', async () => {
  const binding = fakeBinding();
  const entry = completedEntry();
  binding.guard.reserve = async () => {
    binding.calls.reserve += 1;
    return { replayed: true, entry };
  };
  binding.resultStore = {
    get: async ({ requestHash: storedHash }) => ({
      requestHash: storedHash,
      model: MODEL,
      text: 'stored race result',
    }),
  };

  const result = await createFacade(binding).complete(request());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'RESULT_UNAVAILABLE_NO_REDISPATCH');
  assert.equal(result.reason, 'COMPLETION_UNPROVEN');
  assert.equal(result.replayed, true);
  assert.equal(result.settled, true);
  assert.equal(result.accounting.usageCostEstimateMicroUsd, 3650);
  assert.equal(Object.hasOwn(result, 'text'), false);
  assert.equal(binding.calls.reserve, 1);
  assert.equal(binding.calls.fetch, 0);
  assert.equal(binding.calls.stream, 0);
  assert.equal(binding.calls.complete, 0);
  assert.equal(binding.calls.markUncertain, 0);
});

test('partial or failed stream is fully uncertain with no retry', async () => {
  const binding = fakeBinding();
  binding.stream.consumeMessageStream = async () => {
    binding.calls.stream += 1;
    throw Object.assign(new Error('STREAM_INCOMPLETE'), { code: 'STREAM_INCOMPLETE' });
  };
  const result = await createFacade(binding).complete(request());
  assert.equal(result.code, 'ORG_DISPATCH_UNCERTAIN');
  assert.equal(result.reason, 'STREAM_INCOMPLETE');
  assert.equal(result.uncertain, true);
  assert.equal(binding.calls.fetch, 1);
  assert.equal(binding.calls.complete, 0);
  assert.equal(binding.calls.markUncertain, 1);
});

test('malformed or incomplete usage retains full uncertainty', async () => {
  const binding = fakeBinding();
  binding.stream.consumeMessageStream = async () => {
    binding.calls.stream += 1;
    return {
      messageId: 'msg_fake_02',
      reportedModel: MODEL,
      stopReason: 'end_turn',
      text: 'ok',
      usage: { input_tokens: 1 },
      truncated: false,
    };
  };
  const result = await createFacade(binding).complete(request());
  assert.equal(result.code, 'ORG_DISPATCH_UNCERTAIN');
  assert.equal(result.reason, 'USAGE_INVALID');
  assert.equal(binding.calls.complete, 0);
  assert.equal(binding.calls.markUncertain, 1);
});

test('reported model mismatch is closed before settlement', async () => {
  const binding = fakeBinding();
  binding.stream.consumeMessageStream = async () => {
    binding.calls.stream += 1;
    return {
      messageId: 'msg_fake_03',
      reportedModel: 'claude-opus-5-5',
      stopReason: 'end_turn',
      text: 'ok',
      usage: usage(),
      truncated: false,
    };
  };
  const result = await createFacade(binding).complete(request());
  assert.equal(result.code, 'ORG_DISPATCH_UNCERTAIN');
  assert.equal(result.reason, 'MODEL_MISMATCH');
  assert.equal(binding.calls.complete, 0);
  assert.equal(binding.calls.markUncertain, 1);
});

test('redirects, HTTP errors, missing response bodies, and transport failures are uncertain', async () => {
  const cases = [
    [async () => ({ status: 302, body: {} }), 'UPSTREAM_REDIRECT_REFUSED'],
    [async () => ({ status: 500, body: {} }), 'UPSTREAM_HTTP_ERROR'],
    [async () => ({ status: 200 }), 'STREAM_INCOMPLETE'],
    [async () => {
      throw new Error('network down');
    }, 'DISPATCH_AMBIGUOUS'],
    [async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }, 'REQUEST_TIMEOUT'],
  ];
  for (const [fetchImpl, reason] of cases) {
    const binding = fakeBinding();
    binding.fetch = async (url, init) => {
      binding.calls.fetch += 1;
      binding.calls.url = url;
      binding.calls.init = init;
      return fetchImpl();
    };
    const result = await createFacade(binding).complete(request());
    assert.equal(result.code, 'ORG_DISPATCH_UNCERTAIN');
    assert.equal(result.reason, reason);
    assert.equal(binding.calls.fetch, 1);
    assert.equal(binding.calls.complete, 0);
    assert.equal(binding.calls.markUncertain, 1);
  }
});

test('settlement write failure is a reconciliation hold and never retries', async () => {
  const binding = fakeBinding();
  binding.guard.complete = async () => {
    binding.calls.complete += 1;
    throw Object.assign(new Error('LEDGER_IO'), { code: 'LEDGER_IO' });
  };
  const result = await createFacade(binding).complete(request());
  assert.equal(result.code, 'ORG_RECONCILIATION_HOLD');
  assert.equal(result.reason, 'SETTLEMENT_WRITE_FAILED');
  assert.equal(result.settled, false);
  assert.equal(result.uncertain, true);
  assert.equal(binding.calls.fetch, 1);
  assert.equal(binding.calls.complete, 1);
  assert.equal(binding.calls.markUncertain, 0);
});

test('a failed uncertainty write is a reconciliation hold, not a retry', async () => {
  const binding = fakeBinding();
  binding.stream.consumeMessageStream = async () => {
    binding.calls.stream += 1;
    throw Object.assign(new Error('STREAM_PROTOCOL'), { code: 'STREAM_PROTOCOL' });
  };
  binding.guard.markUncertain = async () => {
    binding.calls.markUncertain += 1;
    throw Object.assign(new Error('LEDGER_IO'), { code: 'LEDGER_IO' });
  };
  const result = await createFacade(binding).complete(request());
  assert.equal(result.code, 'ORG_RECONCILIATION_HOLD');
  assert.equal(result.reason, 'UNCERTAINTY_WRITE_FAILED');
  assert.equal(binding.calls.markUncertain, 1);
  assert.equal(binding.calls.fetch, 1);
  assert.equal(binding.calls.complete, 0);
});

test('truncated output settles known usage without a false end_turn success', async () => {
  const binding = fakeBinding();
  binding.stream.consumeMessageStream = async () => {
    binding.calls.stream += 1;
    return {
      messageId: 'msg_fake_04',
      reportedModel: MODEL,
      stopReason: 'max_tokens',
      text: 'partial output',
      usage: usage(),
      truncated: true,
    };
  };
  const result = await createFacade(binding).complete(request());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'OUTPUT_TRUNCATED');
  assert.equal(result.settled, true);
  assert.equal(result.accounting.usageCostEstimateMicroUsd, 3650);
  assert.equal(binding.calls.complete, 1);
  assert.equal(binding.calls.markUncertain, 0);
});

test('application rejection still settles known usage', async () => {
  const binding = fakeBinding();
  binding.validateProductResult = async () => {
    throw new Error('invalid application JSON');
  };
  const result = await createFacade(binding).complete(request());
  assert.equal(result.ok, false);
  assert.equal(result.code, 'APPLICATION_RESULT_REJECTED');
  assert.equal(result.settled, true);
  assert.equal(binding.calls.complete, 1);
  assert.equal(binding.calls.markUncertain, 0);
});

test('paid tool usage is refused and retained as uncertain', async () => {
  const binding = fakeBinding();
  binding.stream.consumeMessageStream = async () => {
    binding.calls.stream += 1;
    return {
      messageId: 'msg_fake_05',
      reportedModel: MODEL,
      stopReason: 'end_turn',
      text: 'ok',
      usage: usage({ server_tool_use: { web_search: 1 } }),
      truncated: false,
    };
  };
  const result = await createFacade(binding).complete(request());
  assert.equal(result.code, 'ORG_DISPATCH_UNCERTAIN');
  assert.equal(result.reason, 'UNEXPECTED_PAID_TOOL');
  assert.equal(binding.calls.complete, 0);
  assert.equal(binding.calls.markUncertain, 1);
});

test('errors do not echo the selected credential', async () => {
  const binding = fakeBinding();
  binding.stream.consumeMessageStream = async () => {
    const error = new Error('transport included ' + KEY);
    error.code = 'STREAM_PROTOCOL';
    throw error;
  };
  const result = await createFacade(binding).complete(request());
  assert.equal(JSON.stringify(result).includes(KEY), false);
  assert.equal(result.code, 'ORG_DISPATCH_UNCERTAIN');
  assert.equal(result.reason, 'STREAM_PROTOCOL');
});
