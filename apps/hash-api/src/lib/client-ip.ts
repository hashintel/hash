import { isIP } from "node:net";

const clientIpSources = [
  "connect-info",
  "x-forwarded-for",
  "cf-connecting-ip",
] as const;

/**
 * Where the client IP of a request is read from.
 *
 * - `connect-info`: the address of the connection.
 * - `x-forwarded-for`: the rightmost address of the last `X-Forwarded-For`
 *   header, as appended by the closest proxy.
 * - `cf-connecting-ip`: the last `CF-Connecting-IP` header, as written by
 *   Cloudflare.
 *
 * A forwarded header is trustworthy only where a proxy owns the entry that is
 * read. On traffic reaching the API directly, it lets a client choose its own
 * IP.
 */
export type ClientIpSource = (typeof clientIpSources)[number];

const isClientIpSource = (value: string): value is ClientIpSource =>
  clientIpSources.some((source) => source === value);

export const parseClientIpSource = (
  value: string | undefined,
): ClientIpSource => {
  if (!value) {
    return "connect-info";
  }
  if (isClientIpSource(value)) {
    return value;
  }
  throw new Error(
    `HASH_API_CLIENT_IP_SOURCE must be one of ${clientIpSources.join(", ")}, got \`${value}\``,
  );
};

const addressWithPort = /^(?:\[(?<v6>[^\]]+)\]|(?<v4>[^:]+)):\d{1,5}$/;

/**
 * Reads the client IP from a forwarded header's value, or returns `undefined`
 * when it holds no usable address.
 *
 * Takes the rightmost comma-separated entry. Node joins repeated headers with
 * `, `, so this is the rightmost entry of the last instance. Accepts a bare
 * address or an `address:port` pair.
 */
export const clientIpFromHeader = (
  value: string | undefined,
): string | undefined => {
  const entry = value?.slice(value.lastIndexOf(",") + 1).trim();
  if (!entry) {
    return undefined;
  }
  if (isIP(entry)) {
    return entry;
  }

  const { v6, v4 } = addressWithPort.exec(entry)?.groups ?? {};
  if (v6 && isIP(v6) === 6) {
    return v6;
  }
  if (v4 && isIP(v4) === 4) {
    return v4;
  }
  return undefined;
};
