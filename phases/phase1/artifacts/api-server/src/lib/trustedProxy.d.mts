export interface ProxyHeaders {
  "x-forwarded-for"?: string | string[];
  "x-forwarded-host"?: string | string[];
  "x-forwarded-proto"?: string | string[];
}

export interface ProxyResolution {
  trustedProxy: boolean;
  clientIp: string | null;
  host: string | null;
  protocol: "http" | "https" | null;
}

export function resolveProxyHeaders(
  remoteAddress: string | undefined,
  headers?: ProxyHeaders,
  trustedProxyIps?: string | string[],
): ProxyResolution;

export function validateTrustedProxyAllowlist(
  trustedProxyIps?: string | string[],
): void;
