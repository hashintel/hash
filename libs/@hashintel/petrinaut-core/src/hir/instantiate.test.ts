import { describe, expect, it } from "vitest";

import { StringPool } from "../simulation/engine/string-pool";
import { instantiateHirBufferLambda } from "./instantiate";

/**
 * The emitter reads parameters as `__params["<name>"]` (see
 * `emit-buffer-js.ts`), so these sources mirror that shape directly.
 */
const lambdaSourceReading = (name: string): string =>
  `(f64, u64, u8, placeBases, indices) => __params[${JSON.stringify(name)}]`;

const callLambda = (
  fn: ReturnType<typeof instantiateHirBufferLambda>,
): number | boolean =>
  fn(
    new Float64Array(0),
    new BigUint64Array(0),
    new Uint8Array(0),
    new Int32Array(0),
    new Int32Array(0),
  );

describe("instantiate parameter binding", () => {
  it("reads a parameter named after an Object.prototype member", () => {
    const fn = instantiateHirBufferLambda(
      lambdaSourceReading("constructor"),
      { constructor: 42 },
      new StringPool(),
    );
    expect(callLambda(fn)).toBe(42);
  });

  it("reads missing parameters as undefined instead of inherited members", () => {
    const fn = instantiateHirBufferLambda(
      lambdaSourceReading("toString"),
      {},
      new StringPool(),
    );
    expect(callLambda(fn)).toBeUndefined();
  });

  it("does not expose the caller's record to compiled code", () => {
    const parameterValues = { rate: 1 };
    const fn = instantiateHirBufferLambda(
      "(f64, u64, u8, placeBases, indices) => { __params.rate = 99; return __params.rate; }",
      parameterValues,
      new StringPool(),
    );
    // The binding is frozen: strict-mode assignment throws, and the caller's
    // record stays untouched either way.
    expect(() => callLambda(fn)).toThrow(TypeError);
    expect(parameterValues.rate).toBe(1);
  });
});
