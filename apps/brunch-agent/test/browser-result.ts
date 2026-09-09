/**
 * The browser result as the fixture browser produced it and the model saw it.
 * The shape is the transport's result carrying the plugin's sidecar; the two
 * narrowings are test knowledge: the fixture browser observes a canonical
 * SDCPN and records fully typed transition attempts.
 */
import type {
  ClientToolResultMetadata,
  ConstructionTransitionRecord,
  DefinitionObservation,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import type { ClientToolResult } from "@hashintel/brunch-agent-transport-aisdk";

export type BrowserObservation = Omit<
  NonNullable<ClientToolResultMetadata["observation"]>,
  "observed"
> & { readonly observed: DefinitionObservation };

export type BrowserResult = Omit<ClientToolResult, "metadata"> & {
  readonly metadata?: {
    readonly observation?: BrowserObservation;
    readonly transitionRecord?: ConstructionTransitionRecord;
  };
};

/** Extract the latest browser result for one tool from the model-facing transcript texts. */
export const browserResultFrom = (
  texts: readonly string[],
  name: string,
  missing: string,
): BrowserResult => {
  for (const body of texts.toReversed()) {
    const match =
      /<client-tool-result\b[^>]*>\s*([\s\S]*?)\s*<\/client-tool-result>/u.exec(
        body,
      );
    if (!match?.[1]) continue;
    const result = (JSON.parse(match[1]) as BrowserResult[]).find(
      (entry) => entry.toolName === name,
    );
    if (result) return result;
  }
  throw new Error(`${missing}: ${name}`);
};
