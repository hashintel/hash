import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

export type UrlValidationResult =
  | { valid: true; url: URL }
  | { valid: false; reason: string };

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "broadcasthost",
]);

/**
 * Returns `true` if the hostname ends with a suffix that indicates a
 * local/non-routable address (e.g. `.local`, `.internal`, `.localhost`).
 */
const hasBlockedSuffix = (hostname: string): boolean => {
  const blockedSuffixes = [".local", ".internal", ".localhost"];
  const lower = hostname.toLowerCase();
  return blockedSuffixes.some((suffix) => lower.endsWith(suffix));
};

/**
 * Returns `true` if the given IPv4 address string falls within a
 * private or reserved range that should not be reachable from
 * server-side fetches:
 *
 * - `0.0.0.0/8`         (current network)
 * - `10.0.0.0/8`        (private, RFC 1918)
 * - `100.64.0.0/10`     (shared address space / CGNAT, RFC 6598)
 * - `127.0.0.0/8`       (loopback)
 * - `169.254.0.0/16`    (link-local, includes AWS metadata at 169.254.169.254)
 * - `172.16.0.0/12`     (private, RFC 1918)
 * - `192.0.0.0/24`      (IETF protocol assignments)
 * - `192.0.2.0/24`      (TEST-NET-1)
 * - `192.88.99.0/24`    (6to4 relay anycast)
 * - `192.168.0.0/16`    (private, RFC 1918)
 * - `198.18.0.0/15`     (benchmarking)
 * - `198.51.100.0/24`   (TEST-NET-2)
 * - `203.0.113.0/24`    (TEST-NET-3)
 * - `224.0.0.0/4`       (multicast)
 * - `240.0.0.0/4`       (reserved)
 * - `255.255.255.255/32` (broadcast)
 */
const isPrivateIPv4 = (ip: string): boolean => {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true; // Malformed – treat as blocked
  }

  const [first, second, third] = parts as [number, number, number, number];

  return (
    first === 0 || // 0.0.0.0/8
    first === 10 || // 10.0.0.0/8
    first === 127 || // 127.0.0.0/8
    (first === 169 && second === 254) || // 169.254.0.0/16
    (first === 172 && second >= 16 && second <= 31) || // 172.16.0.0/12
    (first === 192 && second === 168) || // 192.168.0.0/16
    (first === 192 && second === 0 && third === 0) || // 192.0.0.0/24
    (first === 192 && second === 0 && third === 2) || // 192.0.2.0/24
    (first === 192 && second === 88 && third === 99) || // 192.88.99.0/24
    (first === 198 && (second === 18 || second === 19)) || // 198.18.0.0
    (first === 198 && second === 51 && third === 100) || // 198.51.100.0/24
    (first === 203 && second === 0 && third === 113) || // 203.0.113.0/24
    (first === 100 && second >= 64 && second <= 127) || // 100.64.0.0/10
    first >= 224 // 224.0.0.0/4 (multicast) + 240.0.0.0/4 (reserved)
  );
};

/**
 * Returns `true` if the given IPv6 address string falls within a
 * private or reserved range.
 *
 * - `::1`         (loopback)
 * - `fc00::/7`    (unique local addresses)
 * - `fe80::/10`   (link-local)
 * - `::ffff:0:0/96` (IPv4-mapped – delegates to IPv4 check)
 * - `::`          (unspecified)
 */
const isPrivateIPv6 = (ip: string): boolean => {
  // Normalise by lowercasing
  const lower = ip.toLowerCase();

  if (lower === "::1" || lower === "::") {
    return true;
  }

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped?.[1]) {
    return isPrivateIPv4(v4Mapped[1]);
  }

  // Expand the first group to check prefix bits
  const firstGroup = lower.split(":")[0];
  if (firstGroup) {
    const value = parseInt(firstGroup, 16);
    if (!Number.isNaN(value)) {
      // fc00::/7 – unique local (fc00-fdff)
      if (value >= 0xfc00 && value <= 0xfdff) {
        return true;
      }
      // fe80::/10 – link-local (fe80-febf)
      if (value >= 0xfe80 && value <= 0xfebf) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Returns `true` if the given IP address (v4 or v6) is private/reserved.
 */
const isPrivateIp = (ip: string): boolean => {
  if (isIPv4(ip)) {
    return isPrivateIPv4(ip);
  }
  if (isIPv6(ip)) {
    return isPrivateIPv6(ip);
  }
  // Unknown format – treat as blocked
  return true;
};

/**
 * Validates that a URL is safe to accept as an external resource.
 *
 * Performs synchronous checks only (protocol, hostname pattern, and
 * literal IP address checks). For code paths that will actually fetch
 * the URL, use {@link validateExternalUrlWithDnsCheck} instead which
 * additionally resolves DNS and verifies the resolved IP.
 */
export const validateExternalUrl = (
  rawUrl: string,
  options?: { allowArbitraryPorts?: boolean },
): UrlValidationResult => {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return { valid: false, reason: `Invalid URL: "${rawUrl}"` };
  }

  // --- Protocol check ---
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return {
      valid: false,
      reason: `Disallowed protocol "${url.protocol}" – only http and https are permitted`,
    };
  }

  // --- Port check ---
  if (
    !options?.allowArbitraryPorts &&
    url.port !== "" &&
    url.port !== "80" &&
    url.port !== "443"
  ) {
    return {
      valid: false,
      reason: `Non-standard port "${url.port}" is not permitted`,
    };
  }

  // --- Hostname checks ---
  const hostname = url.hostname.toLowerCase();

  // Strip IPv6 brackets if present (URL parser keeps them in .hostname for
  // bracket-enclosed literals, but net.isIPv6 expects bare addresses)
  const bareHostname = hostname.startsWith("[")
    ? hostname.slice(1, -1)
    : hostname;

  if (BLOCKED_HOSTNAMES.has(bareHostname)) {
    return {
      valid: false,
      reason: `Hostname "${hostname}" is not permitted`,
    };
  }

  if (hasBlockedSuffix(bareHostname)) {
    return {
      valid: false,
      reason: `Hostname "${hostname}" has a blocked suffix`,
    };
  }

  // If the hostname is a literal IP, validate it directly
  if (isIPv4(bareHostname) || isIPv6(bareHostname)) {
    if (isPrivateIp(bareHostname)) {
      return {
        valid: false,
        reason: `IP address "${hostname}" resolves to a private/reserved range`,
      };
    }
  }

  // --- Credential check ---
  if (url.username || url.password) {
    return {
      valid: false,
      reason: "URLs with embedded credentials are not permitted",
    };
  }

  return { valid: true, url };
};

/**
 * Validates that a URL is safe to fetch server-side.
 *
 * Performs all checks from {@link validateExternalUrl} plus resolves the
 * hostname via DNS and verifies that the resolved IP does not fall within
 * a private or reserved range. This guards against DNS rebinding attacks
 * where a hostname initially resolves to a public IP but later resolves
 * to an internal one.
 *
 * Use this variant in any code path that will make an outbound HTTP
 * request to the URL.
 */
export const validateExternalUrlWithDnsCheck = async (
  rawUrl: string,
  options?: { allowArbitraryPorts?: boolean },
): Promise<UrlValidationResult> => {
  const syncResult = validateExternalUrl(rawUrl, options);
  if (!syncResult.valid) {
    return syncResult;
  }

  const { url } = syncResult;
  const bareHostname = url.hostname.startsWith("[")
    ? url.hostname.slice(1, -1)
    : url.hostname;

  // If it's already a literal IP we already checked it synchronously
  if (isIPv4(bareHostname) || isIPv6(bareHostname)) {
    return syncResult;
  }

  // Resolve DNS for all addresses and check each one. A hostname may have
  // multiple A/AAAA records, and checking only one would leave a gap if
  // another record points to a private/reserved IP.
  try {
    const addresses = await lookup(bareHostname, { all: true });
    for (const { address } of addresses) {
      if (isPrivateIp(address)) {
        return {
          valid: false,
          reason: `Hostname "${url.hostname}" resolves to private/reserved IP "${address}"`,
        };
      }
    }
  } catch (error) {
    return {
      valid: false,
      reason: `DNS resolution failed for "${url.hostname}": ${(error as Error).message}`,
    };
  }

  return syncResult;
};
