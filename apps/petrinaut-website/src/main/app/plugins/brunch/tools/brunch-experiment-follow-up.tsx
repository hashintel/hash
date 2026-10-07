import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@hashintel/ds-components";
import { usePetrinautInstance } from "@hashintel/petrinaut/react";

import {
  editorDraftsFor,
  type EditorDraft,
} from "./shared/brunch-draft-experiment-drafts";

import type { PetrinautAiComposerControlContext } from "../../_shared/chat/composer-control";

const sendResults = (
  drafts: ReturnType<typeof editorDraftsFor>,
  submitText: PetrinautAiComposerControlContext["submitText"],
  draft: EditorDraft,
) => {
  if (draft.run.phase !== "finished") return;
  // Claim synchronously in the editor's draft store, including across remounts.
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

const hasDraftToolCall = (
  context: PetrinautAiComposerControlContext,
  draft: EditorDraft,
) =>
  context.messages.some((message) =>
    message.parts.some(
      (part) => "toolCallId" in part && part.toolCallId === draft.toolCallId,
    ),
  );

/** Sends local run results as a new turn, never as a second draft-tool output. */
export const BrunchExperimentFollowUp = ({
  context,
}: {
  context: PetrinautAiComposerControlContext;
}) => {
  const instance = usePetrinautInstance();
  const drafts = editorDraftsFor(instance.definition);
  const snapshot = useSyncExternalStore(drafts.subscribe, drafts.get);
  const running = [...snapshot.drafts.values()].some(
    (draft) =>
      draft.run.phase === "running" && hasDraftToolCall(context, draft),
  );
  const reportRunning = context.reportExperimentRunning;
  useEffect(() => reportRunning?.(running), [reportRunning, running]);
  const pending = [...snapshot.drafts.values()].some(
    (draft) => draft.followUp === "pending",
  );
  const completed = [...snapshot.drafts.values()].filter(
    (draft) =>
      draft.run.phase === "finished" &&
      draft.run.result.status === "complete" &&
      draft.followUp !== "sent" &&
      draft.followUp !== "pending" &&
      hasDraftToolCall(context, draft),
  );
  const unsent = completed.find((draft) => draft.followUp !== "failed");
  const failed = completed.find((draft) => draft.followUp === "failed");

  useEffect(() => {
    if (!unsent || pending || context.status !== "ready" || context.stopped)
      return;
    sendResults(drafts, context.submitText, unsent);
  }, [unsent, pending, context, drafts]);

  return failed ? (
    <Button
      size="xs"
      variant="ghost"
      disabled={
        pending ||
        context.status === "submitted" ||
        context.status === "streaming"
      }
      tooltip="The experiment finished, but its results could not be sent to the AI assistant."
      onClick={() => sendResults(drafts, context.submitText, failed)}
    >
      Retry result summary
    </Button>
  ) : null;
};
