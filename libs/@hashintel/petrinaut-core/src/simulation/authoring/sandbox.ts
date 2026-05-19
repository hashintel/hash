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
  "fetch",
  "XMLHttpRequest",
  "importScripts",
  "Function",
  "setTimeout",
  "setInterval",
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
 * To close that gap we temporarily replace the `.constructor` getter on
 * every built-in prototype a literal could reach. JS is single-threaded so
 * this is safe within a synchronous call: the descriptors are restored in
 * `finally` before any queued microtasks or other code runs. The rightful
 * fix is a Worker/iframe realm — this is defense-in-depth for the
 * same-realm case.
 */
export function runSandboxed<T>(action: () => T): T {
  const prototypes: object[] = [
    Object.prototype,
    Array.prototype,
    Function.prototype,
    String.prototype,
    Number.prototype,
    Boolean.prototype,
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
