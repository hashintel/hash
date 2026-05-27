import { createContext, use } from "react";

import type { EvalSandbox } from "./interface";

/**
 * React context for the active {@link EvalSandbox}. Providers wire this
 * up; consumer hooks (`useEvalSandbox`) read it. There is no default —
 * `PetrinautProvider` must always supply one (inline if unset by the
 * host).
 */
export const EvalSandboxContext = createContext<EvalSandbox | null>(null);

/** Hook for reading the active sandbox. Throws if no provider is mounted. */
export function useEvalSandbox(): EvalSandbox {
  const sandbox = use(EvalSandboxContext);
  if (!sandbox) {
    throw new Error(
      "useEvalSandbox: no EvalSandbox provider found. Wrap your tree in <PetrinautProvider>.",
    );
  }
  return sandbox;
}
