import { describe, expect, it } from "vitest";

import { clientIpFromHeader, parseClientIpSource } from "./client-ip";

describe("parseClientIpSource", () => {
  it("defaults to the connection address when unset", () => {
    expect(parseClientIpSource(undefined)).toBe("connect-info");
    expect(parseClientIpSource("")).toBe("connect-info");
  });

  it("accepts each source", () => {
    expect(parseClientIpSource("x-forwarded-for")).toBe("x-forwarded-for");
    expect(parseClientIpSource("cf-connecting-ip")).toBe("cf-connecting-ip");
  });

  it("rejects an unknown source", () => {
    expect(() => parseClientIpSource("X-Forwarded-For")).toThrow(
      "HASH_API_CLIENT_IP_SOURCE must be one of connect-info, x-forwarded-for, cf-connecting-ip, got `X-Forwarded-For`",
    );
  });
});

describe("clientIpFromHeader", () => {
  it("reads the rightmost entry", () => {
    expect(clientIpFromHeader("203.0.113.9, 192.0.2.1, 198.51.100.7")).toBe(
      "198.51.100.7",
    );
  });

  it("accepts a port suffix", () => {
    expect(clientIpFromHeader("192.0.2.1:5678")).toBe("192.0.2.1");
    expect(clientIpFromHeader("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(clientIpFromHeader("2001:db8::1")).toBe("2001:db8::1");
  });

  it("returns undefined for a missing or unparsable header", () => {
    expect(clientIpFromHeader(undefined)).toBeUndefined();
    expect(clientIpFromHeader("")).toBeUndefined();
    expect(clientIpFromHeader("198.51.100.7, unknown")).toBeUndefined();
    expect(clientIpFromHeader("[192.0.2.1]:80")).toBeUndefined();
  });
});
