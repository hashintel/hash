import {
  claimBrowserCall,
  finishBrowserCall,
} from "../../../src/browser-call/browser-call";

import type { Context } from "@earendil-works/chord";
import type { ConversationId, Harness } from "@earendil-works/pi-durable";

/**
 * The browser's half of a call, as Brunch's panel speaks it over HTTP
 * (`apps/brunch-agent/src/server/http/browser-calls.ts`): claim the issued
 * call, run it in the editor, and post the result with the capability. Here
 * the editor is faked and the routes are direct host calls, made in the
 * process that owns the storage.
 */
export const actAsBrowser = async (
  harness: Harness,
  conversationId: ConversationId,
  toolCallId: string,
  context: Context,
) => {
  const claim = await claimBrowserCall(
    harness,
    conversationId,
    toolCallId,
    context,
  );
  if (claim === undefined) throw new Error("The call could not be claimed.");
  const secondClaim = await claimBrowserCall(
    harness,
    conversationId,
    toolCallId,
    context,
  );
  const output = { applied: true, title: claim.input.title ?? null };
  const finished = await finishBrowserCall(
    harness,
    {
      conversationId,
      toolCallId,
      toolName: claim.toolName,
      capability: claim.capability,
      canonicalInput: claim.input,
      output,
    },
    context,
  );
  return {
    claimed: { toolName: claim.toolName, input: claim.input },
    secondClaim: secondClaim ?? null,
    output,
    finished,
  };
};
