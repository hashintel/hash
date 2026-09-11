/** Test/evaluation-only factory substitution; never imported by the application. */
import { registerHooks } from "node:module";

import type { Provider } from "@earendil-works/pi-ai";

const providerKey = Symbol.for("brunch.evaluation.faux-provider");
const factoryUrl = "brunch-faux-provider:anthropic";
let installed = false;

/** Keep production app registration intact while replacing only its network provider. */
export const installFauxProvider = (provider: Provider): void => {
  if (provider.id !== "anthropic")
    throw new Error("Expected a faux Anthropic provider.");
  Reflect.set(globalThis, providerKey, provider);
  if (installed) return;
  installed = true;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      return specifier === "@earendil-works/pi-ai/providers/anthropic"
        ? { url: factoryUrl, shortCircuit: true }
        : nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      return url === factoryUrl
        ? {
            format: "module",
            source:
              'export const anthropicProvider = () => globalThis[Symbol.for("brunch.evaluation.faux-provider")];',
            shortCircuit: true,
          }
        : nextLoad(url, context);
    },
  });
};
