/**
 * Brunch's mixed and dependent tool-admission rules
 * (`apps/brunch-agent/src/server/provider-admission.ts`, configured in
 * `apps/brunch-agent/src/app.ts`) as a `beforeTool` hook. Brunch refused a
 * whole model response before any call ran; Pi Durable cannot refuse a
 * response (`afterResponse` returns nothing), so each offending call is
 * blocked with a tool error the model sees, and the response's other calls
 * run. The hook sees one call, so it reads the call's siblings from the
 * assistant entry that issued it.
 */
import {
  defineExtension,
  type EntryRecord,
  hook,
  type HookApi,
  ToolTask,
} from "@earendil-works/pi-durable";

import {
  browserExecutedToolNames,
  brunchTools,
  netReaderToolNames,
} from "@hashintel/brunch-agent";
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import type { Context } from "@earendil-works/chord";

/** Server tools that may share a response with browser calls, as Brunch's `app.ts` lists them. */
const mixedToolNames: ReadonlySet<string> = new Set([
  ...browserExecutedToolNames,
  brunchTools.ping,
  brunchTools.ledgerCommit,
  brunchTools.ledgerCompile,
  brunchTools.activateSkill,
  brunchTools.readSkillResource,
  brunchTools.queryBasis,
]);

/** Running these beside their dependency would answer from the previous result. */
const dependentToolNames: ReadonlyMap<string, readonly string[]> = new Map([
  [
    brunchTools.queryBasis,
    [getLatestNetDefinitionToolName, ...Object.values(netReaderToolNames)],
  ],
  [brunchTools.ledgerCompile, [brunchTools.ledgerCommit]],
  [brunchTools.draftPetrinautExperiment, [getLatestNetDefinitionToolName]],
]);

/**
 * Why `toolName` may not run in a response that calls `responseToolNames`
 * (its own name included), or undefined when it may.
 *
 * - Mixed: a response with browser and server calls blocks each server call
 *   outside `mixedToolNames`. Brunch refused the whole response.
 * - Dependent: a call whose dependency is in the same response is blocked.
 */
export const admissionRefusal = (
  toolName: string,
  responseToolNames: readonly string[],
): string | undefined => {
  if (
    !browserExecutedToolNames.has(toolName) &&
    !mixedToolNames.has(toolName) &&
    responseToolNames.some((name) => browserExecutedToolNames.has(name))
  )
    return `Mixed browser/server call refused: ${toolName} does not run in a response that calls browser tools; the response's other calls still run. Submit server work separately from browser work.`;
  const dependency = dependentToolNames
    .get(toolName)
    ?.find((name) => responseToolNames.includes(name));
  return dependency === undefined
    ? undefined
    : `Dependent call refused: ${toolName} reads the result of ${dependency}. Call ${dependency} first, then ${toolName} after its result returns.`;
};

const pageSize = 20;

const callNamesIn = (entry: EntryRecord, callId: string) => {
  const calls = (entry.model ?? []).flatMap((message) =>
    message.role === "assistant"
      ? message.content.flatMap((part) =>
          part.type === "toolCall" ? [part] : [],
        )
      : [],
  );
  return calls.some(({ id }) => id === callId)
    ? calls.map(({ name }) => name)
    : undefined;
};

/**
 * The tool names of the response that issued `callId`: the newest assistant
 * entry that calls it. Its round's results are the only entries after it.
 */
export const responseToolNamesOf = async (
  callId: string,
  api: Pick<HookApi, "entries">,
  context: Context,
): Promise<readonly string[] | undefined> => {
  let cursor: Parameters<HookApi["entries"]>[2];
  do {
    // Each page needs the previous page's cursor.
    // eslint-disable-next-line no-await-in-loop
    const page = await api.entries(
      { order: "descending" },
      pageSize,
      cursor,
      context,
    );
    for (const entry of page.items) {
      if (entry.kind !== "pi.assistant") continue;
      const names = callNamesIn(entry, callId);
      if (names !== undefined) return names;
    }
    cursor = page.next;
  } while (cursor !== undefined);
  return undefined;
};

export const toolAdmissionExtension = defineExtension({
  name: "brunch.tool-admission",
  hooks: [
    hook(ToolTask, {
      beforeTool: async (call, api, context) => {
        // A nested call is a running tool's, not the model's response.
        if (call.parent !== undefined) return undefined;
        const names = await responseToolNamesOf(call.id, api, context);
        const refusal =
          names === undefined ? undefined : admissionRefusal(call.name, names);
        return refusal === undefined ? undefined : { block: refusal };
      },
    }),
  ],
});
