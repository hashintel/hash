import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@hashintel/ds-components";
import { usePetrinautInstance } from "@hashintel/petrinaut/react";

import {
  sessionDraftsFor,
  type SessionDraft,
} from "../shared/brunch-draft-experiment-drafts";

import type { PetrinautAiComposerControlContext } from "@hashintel/petrinaut/ui";

const sendResults = (
  drafts: ReturnType<typeof sessionDraftsFor>,
  submitText: PetrinautAiComposerControlContext["submitText"],
  draft: SessionDraft,
) => {
  if (draft.run.phase !== "finished") return;
  // Claim synchronously in the session store, including across remounts.
  const current = drafts.get();
  const latest = current.drafts.get(draft.toolCallId);
  if (
    latest?.followUp === "sent" ||
    [...current.drafts.values()].some((entry) => entry.followUp === "pending")
  )
    return;
  drafts.update(draft.toolCallId, { followUp: "pending" });
  void submitText({
    target: "message",
    preserveDraft: true,
    text: `The experiment I chose to run has finished. Interpret these results and suggest the next decision; do not start another run.\n\n${JSON.stringify(draft.run.result)}`,
  }).then(
    () => drafts.update(draft.toolCallId, { followUp: "sent" }),
    () => drafts.update(draft.toolCallId, { followUp: "failed" }),
  );
};

/** Sends local run results as a new turn, never as a second draft-tool output. */
export const BrunchExperimentFollowUp = ({
  context,
}: {
  context: PetrinautAiComposerControlContext;
}) => {
  const instance = usePetrinautInstance();
  const drafts = sessionDraftsFor(instance.definition);
  const snapshot = useSyncExternalStore(drafts.subscribe, drafts.get);
  const pending = [...snapshot.drafts.values()].some(
    (draft) => draft.followUp === "pending",
  );
  const completed = [...snapshot.drafts.values()].find(
    (draft) =>
      draft.run.phase === "finished" &&
      draft.run.result.status === "complete" &&
      draft.followUp !== "sent" &&
      draft.followUp !== "pending" &&
      context.messages.some((message) =>
        message.parts.some(
          (part) =>
            "toolCallId" in part && part.toolCallId === draft.toolCallId,
        ),
      ),
  );

  useEffect(() => {
    if (
      !completed ||
      pending ||
      completed.followUp === "failed" ||
      context.status !== "ready" ||
      context.stopped
    )
      return;
    sendResults(drafts, context.submitText, completed);
  }, [completed, pending, context, drafts]);

  return completed?.followUp === "failed" ? (
    <Button
      size="xs"
      variant="ghost"
      disabled={
        pending ||
        context.status === "submitted" ||
        context.status === "streaming"
      }
      tooltip="The experiment finished, but its results could not be sent to Brunch."
      onClick={() => sendResults(drafts, context.submitText, completed)}
    >
      Retry result summary
    </Button>
  ) : null;
};
