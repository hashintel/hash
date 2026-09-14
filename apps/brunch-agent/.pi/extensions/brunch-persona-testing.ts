/** Pi registration for the browser-visible persona launcher; no independent SDK transport. */
import { sendPersonaBrowserTurn } from "../../src/evaluations/persona/browser-bridge.ts";
import {
  type BrunchTurnExtensionApi,
  createBrunchTurnTool,
} from "../../src/evaluations/persona/brunch-turn.ts";
import {
  registerPersonaAccounting,
  type PersonaAccountingContext,
} from "../../src/evaluations/persona/request-accounting.ts";

import type { Provider } from "@earendil-works/pi-ai";

interface BrunchPersonaExtensionApi extends BrunchTurnExtensionApi {
  registerProvider(provider: Provider): void;
  registerFlag(
    name: string,
    options: { readonly description: string; readonly type: "string" },
  ): void;
  getFlag(name: string): boolean | string | undefined;
  on(
    event: "session_start" | "session_shutdown",
    handler: (
      event: unknown,
      context: PersonaAccountingContext,
    ) => void | Promise<void>,
  ): void;
}

const browserBridgeFlag = "brunch-browser-bridge";

// Pi loads an extension through its default export.
export default function brunchPersonaTestingExtension(
  pi: BrunchPersonaExtensionApi,
): void {
  registerPersonaAccounting(pi);
  pi.registerFlag(browserBridgeFlag, {
    type: "string",
    description:
      "Private launcher socket for turns executed by the real browser panel",
  });
  let generation = 0;
  pi.on("session_shutdown", () => {
    generation += 1;
  });
  pi.on("session_start", () => {
    // Pi hydrates CLI flags after the factory, and may continue after lifecycle errors.
    // Invalidate prior closures before validation so failure cannot retain an old route.
    generation += 1;
    const currentGeneration = generation;
    const value = pi.getFlag(browserBridgeFlag);
    const socketPath = typeof value === "string" ? value.trim() : "";
    if (!socketPath)
      throw new Error(
        "Persona requires the browser launcher. Run yarn brunch:persona --case <name-or-directory> --budget-usd <allocation>; it supplies --brunch-browser-bridge.",
      );
    const tool = createBrunchTurnTool((message, signal) =>
      sendPersonaBrowserTurn(socketPath, message, signal),
    );
    pi.registerTool({
      ...tool,
      execute: async (...args) => {
        if (generation !== currentGeneration)
          throw new Error(
            "brunch_turn session is not initialized; browser bridge unavailable",
          );
        return tool.execute(...args);
      },
    });
  });
}
