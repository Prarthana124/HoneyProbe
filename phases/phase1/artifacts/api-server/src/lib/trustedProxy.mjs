import { BlockList, isIP } from "node:net";

function normalizeIp(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  let normalized = trimmed.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mappedAddress = normalized.slice(7);
    if (isIP(mappedAddress) === 4) {
      normalized = mappedAddress;
    } else {
      const mappedHex = mappedAddress.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (mappedHex) {
        const address = (BigInt(`0x${mappedHex[1]}`) << 16n) |
          BigInt(`0x${mappedHex[2]}`);
        normalized = [24n, 16n, 8n, 0n]
          .map((shift) => Number((address >> shift) & 255n))
          .join(".");
      }
    }
  }
  return isIP(normalized) ? normalized.toLowerCase() : null;
}

function firstHeader(value) {
  const raw = Array.isArray(value) ? value.join(",") : value;
  return typeof raw === "string" ? raw.split(",", 1)[0].trim() : "";
}

function trustedHost(value) {
  if (!value) return null;
  const match = value.match(
    /^(?:[a-z0-9.-]+|\[[0-9a-f:.]+\])(?::(\d{1,5}))?$/i,
  );
  if (!match) return null;
  if (match[1] && (Number(match[1]) < 1 || Number(match[1]) > 65535)) {
    return null;
  }
  return value;
}

function trustedNetworksFrom(value) {
  const blockList = new BlockList();
  const entries = (Array.isArray(value) ? value : String(value ?? "").split(","))
    .map((entry) => String(entry).trim())
    .filter(Boolean);

  for (const entry of entries) {
    const parts = entry.split("/");
    if (parts.length > 2) {
      throw new Error(`Invalid trusted proxy network: ${entry}`);
    }
    const address = parts[0];
    const family = isIP(address);
    const maxPrefix = family === 4 ? 32 : family === 6 ? 128 : -1;
    const prefix = parts.length === 1
      ? maxPrefix
      : (/^(0|[1-9][0-9]*)$/.test(parts[1]) ? Number(parts[1]) : -1);
    if (maxPrefix < 0 || prefix < 0 || prefix > maxPrefix) {
      throw new Error(`Invalid trusted proxy network: ${entry}`);
    }
    try {
      blockList.addSubnet(address, prefix, family === 4 ? "ipv4" : "ipv6");
    } catch {
      throw new Error(`Invalid trusted proxy network: ${entry}`);
    }
  }
  return blockList;
}

function isTrusted(address, blockList) {
  if (!address) return false;
  const family = isIP(address);
  return family !== 0 && blockList.check(address, family === 4 ? "ipv4" : "ipv6");
}

export function validateTrustedProxyAllowlist(
  trustedProxyIps = process.env.HONEYPROBE_TRUSTED_PROXY_IPS ?? "",
) {
  trustedNetworksFrom(trustedProxyIps);
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
  const trustedNetworks = trustedNetworksFrom(trustedProxyIps);
  const trusted = isTrusted(peer, trustedNetworks);

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
    ? (Array.isArray(headers["x-forwarded-for"])
        ? headers["x-forwarded-for"].join(",")
        : String(headers["x-forwarded-for"]))
        .split(",")
        .map(normalizeIp)
    : [];
  let clientIp = null;

  if (chain.length > 0 && chain.every(Boolean)) {
    clientIp = peer;
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      if (!isTrusted(clientIp, trustedNetworks)) break;
      clientIp = chain[index];
    }
    if (isTrusted(clientIp, trustedNetworks)) clientIp = null;
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
