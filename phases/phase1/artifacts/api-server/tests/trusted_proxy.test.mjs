import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveProxyHeaders,
  validateTrustedProxyAllowlist,
} from "../src/lib/trustedProxy.mjs";

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

test("trusts IPv4 CIDR proxy peers and ignores spoofed values to the left", () => {
  const result = resolveProxyHeaders(
    "10.20.0.8",
    {
      "x-forwarded-for": "192.0.2.200, 198.51.100.44, 10.20.0.7",
      "x-forwarded-host": "honeyprobe.example",
      "x-forwarded-proto": "https",
    },
    ["10.20.0.0/24"],
  );

  assert.deepEqual(result, {
    trustedProxy: true,
    clientIp: "198.51.100.44",
    host: "honeyprobe.example",
    protocol: "https",
  });
});

test("supports IPv6 CIDR peers and IPv4-mapped socket addresses", () => {
  const ipv6 = resolveProxyHeaders(
    "2001:db8:12:34::9",
    { "x-forwarded-for": "2001:db8:ffff::7" },
    "2001:db8:12::/48",
  );
  assert.equal(ipv6.trustedProxy, true);
  assert.equal(ipv6.clientIp, "2001:db8:ffff::7");

  const mapped = resolveProxyHeaders(
    "::ffff:c000:0202",
    { "x-forwarded-for": "::ffff:c633:6407" },
    "192.0.2.0/24",
  );
  assert.equal(mapped.trustedProxy, true);
  assert.equal(mapped.clientIp, "198.51.100.7");
});

test("does not invent a client address when the forwarded chain is missing or all trusted", () => {
  const missing = resolveProxyHeaders("10.0.0.2", {}, "10.0.0.0/8");
  const allTrusted = resolveProxyHeaders(
    "10.0.0.2",
    { "x-forwarded-for": "10.1.0.2, 10.0.0.1" },
    "10.0.0.0/8",
  );
  assert.equal(missing.clientIp, null);
  assert.equal(allTrusted.clientIp, null);
});

test("rejects malformed trusted proxy networks instead of silently changing policy", () => {
  assert.throws(() => validateTrustedProxyAllowlist("10.0.0.1/33"));
  assert.throws(() => validateTrustedProxyAllowlist("not-an-ip"));
});
