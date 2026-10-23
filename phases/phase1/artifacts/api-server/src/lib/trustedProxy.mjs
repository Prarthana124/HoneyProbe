import { isIP } from "node:net";

function normalizeIp(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase().startsWith("::ffff:")
    ? trimmed.slice(7)
    : trimmed;
  return isIP(normalized) ? normalized.toLowerCase() : null;
}

function firstHeader(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.split(",", 1)[0].trim() : "";
}

function trustedHost(value) {
  if (!value) return null;
  const hostname =
    /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(value) ||
    /^\[[0-9a-f:.]+\](?::\d{1,5})?$/i.test(value);
  return hostname ? value : null;
}

/**
 * Use forwarding headers only when the immediate TCP peer is explicitly trusted.
 * The proxy chain is walked from nearest to farthest; the first untrusted hop is
 * treated as the client, so a client-supplied leftmost X-Forwarded-For is ignored
 * when a trusted edge proxy appends its own observed address.
 */
export function resolveProxyHeaders(
  remoteAddress,
  headers = {},
  trustedProxyIps = process.env.HONEYPROBE_TRUSTED_PROXY_IPS ?? "",
) {
  const peer = normalizeIp(remoteAddress);
  const trustedIps = new Set(
    (Array.isArray(trustedProxyIps)
      ? trustedProxyIps
      : String(trustedProxyIps).split(",")
    )
      .map(normalizeIp)
      .filter(Boolean),
  );
  const trusted = Boolean(peer && trustedIps.has(peer));

  if (!trusted) {
    return {
      trustedProxy: false,
      clientIp: peer,
      host: null,
      protocol: null,
    };
  }

  const forwardedFor = firstHeader(headers["x-forwarded-for"]);
  const chain = forwardedFor
    ? String(headers["x-forwarded-for"])
        .split(",")
        .map(normalizeIp)
    : [];
  let clientIp = null;

  if (chain.length > 0 && chain.every(Boolean)) {
    clientIp = peer;
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      if (!trustedIps.has(clientIp)) break;
      clientIp = chain[index];
    }
  }

  const protocolValue = firstHeader(headers["x-forwarded-proto"]).toLowerCase();
  return {
    trustedProxy: true,
    clientIp,
    host: trustedHost(firstHeader(headers["x-forwarded-host"])),
    protocol: protocolValue === "http" || protocolValue === "https"
      ? protocolValue
      : null,
  };
}
