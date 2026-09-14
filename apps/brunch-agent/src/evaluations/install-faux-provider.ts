/** Test/evaluation-only factory substitution; never imported by the application. */
import { registerHooks } from "node:module";

import type { Provider } from "@earendil-works/pi-ai";

const installed = new Set<string>();

/** Keep production app registration intact while replacing only its network provider. */
export const installFauxProvider = (provider: Provider): void => {
  if (provider.id !== "anthropic" && provider.id !== "openai")
    throw new Error("Expected a faux Anthropic or OpenAI provider.");
  const key = `brunch.evaluation.faux-provider.${provider.id}`;
  const providerKey = Symbol.for(key);
  const factoryUrl = `brunch-faux-provider:${provider.id}`;
  Reflect.set(globalThis, providerKey, provider);
  if (installed.has(provider.id)) return;
  installed.add(provider.id);
  registerHooks({
    resolve(specifier, context, nextResolve) {
      return specifier === `@earendil-works/pi-ai/providers/${provider.id}`
        ? { url: factoryUrl, shortCircuit: true }
        : nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      return url === factoryUrl
        ? {
            format: "module",
            source:
              provider.id === "anthropic"
                ? 'export const anthropicProvider = () => globalThis[Symbol.for("brunch.evaluation.faux-provider.anthropic")];'
                : 'export const openaiProvider = () => globalThis[Symbol.for("brunch.evaluation.faux-provider.openai")];',
            shortCircuit: true,
          }
        : nextLoad(url, context);
    },
  });
};
