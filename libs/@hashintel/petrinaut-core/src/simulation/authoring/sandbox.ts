/**
 * Shared hardening helpers for evaluating user-authored JS expressions
 * (scenario expressions, metric bodies, …). Co-located so the compilers
 * can't drift on what they consider "safe enough".
 */

/**
 * Globals to shadow inside the user function body. Declared as `var` so
 * they become `undefined` in scope, preventing the expression from
 * reaching browser/environment APIs by name.
 *
 * Note: `eval` cannot be shadowed via `var` in strict mode (SyntaxError).
 * It is mitigated by shadowing `Function` (blocks eval construction) and
 * `globalThis` (blocks `globalThis.eval`). Direct `eval()` in strict mode
 * cannot leak scope, and without access to globals it has limited power.
 */
export const SHADOWED_GLOBALS = [
  "window",
  "document",
  "globalThis",
  "self",
  "navigator",
  "fetch",
  "WebSocket",
  "XMLHttpRequest",
  "importScripts",
  "localStorage",
  "sessionStorage",
  "performance",
  "crypto",
  "process",
  "Buffer",
  "require",
  "module",
  "exports",
  "__filename",
  "__dirname",
  "Deno",
  "Bun",
  "console",
  "Function",
  "Promise",
  "setTimeout",
  "setInterval",
  "setImmediate",
  "clearImmediate",
  "queueMicrotask",
].join(",");

/**
 * Run a synchronous action with the constructor-chain escape route blocked.
 *
 * User expressions run inside `new Function()` and therefore share the host
 * realm. Shadowing `Function` as a local `var` only prevents identifier
 * lookup; an attacker can still walk to the real `Function` via any
 * literal's `.constructor.constructor` chain (e.g.
 * `({}).constructor.constructor`), and freezing the user-facing argument
 * objects only protects them, not freshly-created literals inside the
 * expression body.
 *
 * To make the common form of that escape fail we temporarily replace the
 * `.constructor` getter on the built-in prototypes below. The descriptors are
 * restored in `finally` before any queued microtasks or other code runs.
 *
 * This is defense-in-depth, not an isolation boundary: hostile JavaScript has
 * more reflective and asynchronous escape routes. Server-side callers must
 * still execute user-authored models in a separately constrained process and
 * container. A restricted compiler/interpreter is the durable fix.
 */
export function runSandboxed<T>(action: () => T): T {
  const generatorPrototype = Reflect.getPrototypeOf(
    function* sandboxGenerator() {},
  );
  const asyncFunctionPrototype = Reflect.getPrototypeOf(
    async function sandboxAsyncFunction() {},
  );
  const asyncGeneratorPrototype = Reflect.getPrototypeOf(
    async function* sandboxAsyncGenerator() {},
  );
  const prototypes: object[] = [
    Object.prototype,
    Array.prototype,
    Function.prototype,
    String.prototype,
    Number.prototype,
    Boolean.prototype,
    BigInt.prototype,
    Symbol.prototype,
    RegExp.prototype,
    Date.prototype,
    Error.prototype,
    Map.prototype,
    Set.prototype,
    WeakMap.prototype,
    WeakSet.prototype,
    Promise.prototype,
    ArrayBuffer.prototype,
    ...(typeof SharedArrayBuffer === "undefined"
      ? []
      : [SharedArrayBuffer.prototype]),
    DataView.prototype,
    Int8Array.prototype,
    Uint8Array.prototype,
    Uint8ClampedArray.prototype,
    Int16Array.prototype,
    Uint16Array.prototype,
    Int32Array.prototype,
    Uint32Array.prototype,
    Float32Array.prototype,
    Float64Array.prototype,
    BigInt64Array.prototype,
    BigUint64Array.prototype,
    ...(generatorPrototype ? [generatorPrototype] : []),
    ...(asyncFunctionPrototype ? [asyncFunctionPrototype] : []),
    ...(asyncGeneratorPrototype ? [asyncGeneratorPrototype] : []),
  ];
  const saved = prototypes.map((p) =>
    Object.getOwnPropertyDescriptor(p, "constructor"),
  );
  const blocked = () => {
    throw new Error("Access to .constructor is blocked inside user code.");
  };

  for (const p of prototypes) {
    Object.defineProperty(p, "constructor", {
      get: blocked,
      configurable: true,
    });
  }

  try {
    return action();
  } finally {
    for (const [i, p] of prototypes.entries()) {
      const original = saved[i];
      if (original) {
        Object.defineProperty(p, "constructor", original);
      }
    }
  }
}
