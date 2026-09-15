/**
 * The browser result as the fixture browser produced it and the model saw it.
 * The shape is the transport's result carrying the plugin's sidecar; the two
 * narrowings are test knowledge: the fixture browser observes a canonical
 * SDCPN and records fully typed mutation attempts.
 */
import type {
  ClientToolResultMetadata,
  ConstructionMutationRecord,
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
    readonly mutationRecord?: ConstructionMutationRecord;
  };
};

export type ModelVisibleBrowserObservation = {
  readonly toolCallId: string;
  readonly sha256: string;
};

/** Read the minimal verified observation promoted into model-visible output. */
export const modelVisibleObservationFrom = (
  result: BrowserResult,
): ModelVisibleBrowserObservation => {
  const output =
    typeof result.output === "object" &&
    result.output !== null &&
    !Array.isArray(result.output)
      ? result.output
      : undefined;
  const observation =
    output &&
    "observation" in output &&
    typeof output.observation === "object" &&
    output.observation !== null &&
    !Array.isArray(output.observation)
      ? output.observation
      : undefined;
  if (
    observation === undefined ||
    !("toolCallId" in observation) ||
    typeof observation.toolCallId !== "string" ||
    !("sha256" in observation) ||
    typeof observation.sha256 !== "string"
  ) {
    throw new Error("Browser result lacks model-visible observation identity.");
  }
  return {
    toolCallId: observation.toolCallId,
    sha256: observation.sha256,
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
