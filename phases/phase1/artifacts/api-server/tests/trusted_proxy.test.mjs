import assert from "node:assert/strict";
import test from "node:test";

import { resolveProxyHeaders } from "../src/lib/trustedProxy.mjs";

test("ignores forwarded values from an untrusted peer", () => {
  const result = resolveProxyHeaders(
    "203.0.113.9",
    {
      "x-forwarded-for": "198.51.100.77",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "http",
    },
    ["10.0.0.1"],
  );

  assert.deepEqual(result, {
    trustedProxy: false,
    clientIp: "203.0.113.9",
    host: null,
    protocol: null,
  });
});

test("uses the nearest untrusted client hop behind trusted proxies", () => {
  const result = resolveProxyHeaders(
    "10.0.0.2",
    {
      "x-forwarded-for": "192.0.2.200, 198.51.100.44, 10.0.0.1",
      "x-forwarded-host": "honeyprobe.example, internal.example",
      "x-forwarded-proto": "https, http",
    },
    ["10.0.0.1", "10.0.0.2"],
  );

  assert.deepEqual(result, {
    trustedProxy: true,
    clientIp: "198.51.100.44",
    host: "honeyprobe.example",
    protocol: "https",
  });
});

test("does not use malformed forwarded chains or invalid origin values", () => {
  const result = resolveProxyHeaders(
    "::ffff:10.0.0.2",
    {
      "x-forwarded-for": "198.51.100.44, not-an-ip",
      "x-forwarded-host": "attacker.example\r\nx-forwarded-for: 1.2.3.4",
      "x-forwarded-proto": "javascript",
    },
    ["10.0.0.2"],
  );

  assert.deepEqual(result, {
    trustedProxy: true,
    clientIp: null,
    host: null,
    protocol: null,
  });
});
