import { describe, expect, it } from "vitest";

import type { SDCPN } from "./sdcpn";

/**
 * The JSON-object shape consumers persist the net as (hash-frontend stores
 * the whole SDCPN as an entity property value). Interfaces have no implicit
 * index signature, so a single `interface` reachable from {@link SDCPN}
 * breaks this assignability — every type in the net's closure must be a
 * `type` alias of JSON-compatible values.
 */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonValue[]
  | { [key: string]: JsonValue };

describe("SDCPN", () => {
  it("stays assignable to a JSON object shape", () => {
    const net = {} as SDCPN;
    // A compile error on this line means some type reachable from SDCPN is
    // an interface or carries a non-JSON value (function, bigint, Map…).
    const json: JsonValue = net;
    expect(json).toBe(net);
  });
});
