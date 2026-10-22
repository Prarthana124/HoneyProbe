import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/lib/honeyprobe-api.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const honeyProbeApi = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

async function withFetch(fetchImplementation, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImplementation;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('Live API requests use same-origin, uncached JSON and return actual responses', async () => {
  const expected = { items: [], total: 0, limit: 8, offset: 0 };
  await withFetch(async (path, init) => {
    assert.equal(path, '/api/events?include_demo=false&limit=8');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Accept, 'application/json');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(init.headers['X-Operator-View'], 'live');
    return new Response(JSON.stringify(expected), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }, async () => {
    const actual = await honeyProbeApi.honeyProbeRequest(
      '/api/events?include_demo=false&limit=8',
      {
        method: 'POST',
        body: '{}',
        headers: { 'X-Operator-View': 'live' },
      },
    );
    assert.deepEqual(actual, expected);
  });
});

test('Live API errors preserve useful HTTP status and backend details', async () => {
  for (const [status, detail] of [
    [401, 'Sign in required.'],
    [403, 'Operator access is not allowed.'],
    [404, 'Record not found.'],
    [422, 'Invalid request.'],
    [429, 'Rate limit reached.'],
    [500, 'Service error.'],
  ]) {
    await withFetch(
      async () =>
        new Response(JSON.stringify({ detail }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      async () => {
        await assert.rejects(
          honeyProbeApi.honeyProbeRequest('/api/events'),
          new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        );
      },
    );
  }
});

test('Live API failures never fall back to demo data', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    throw new TypeError('Network unavailable');
  }, async () => {
    await assert.rejects(
      honeyProbeApi.honeyProbeRequest('/api/findings?include_demo=false'),
      /Network unavailable/,
    );
    assert.equal(calls, 1);
  });
});

test('simulated records are identified rather than treated as live', () => {
  const event = { environment: 'local', metadata: {} };
  assert.equal(honeyProbeApi.isSimulatedEvent(event), false);
  assert.equal(
    honeyProbeApi.isSimulatedEvent({
      ...event,
      metadata: { simulated: true },
    }),
    true,
  );
  assert.equal(
    honeyProbeApi.isSimulatedEvent({
      ...event,
      environment: 'test',
    }),
    true,
  );
});
