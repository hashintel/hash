/* eslint-disable @typescript-eslint/no-use-before-define */

/**
 * Proxy-based noop stub for Node.js built-in modules (os, fs, path, etc.).
 *
 * Any property access returns another proxy, any function call returns "".
 * This prevents TypeScript compiler and other Node.js-dependent code from
 * throwing when their Node.js API calls are unreachable in the browser.
 */

type Noop = ((...args: unknown[]) => unknown) & Record<string, unknown>;

const handler: ProxyHandler<Noop> = {
  get(_target, prop) {
    if (prop === Symbol.toPrimitive) {
      return () => "";
    }
    if (prop === Symbol.toStringTag) {
      return "Module";
    }
    if (prop === "__esModule") {
      return true;
    }
    if (prop === "default") {
      return noopProxy;
    }
    return noopProxy;
  },
  apply() {
    return "";
  },
};

const noopProxy: Noop = new Proxy((() => "") as Noop, handler);

export default noopProxy;
