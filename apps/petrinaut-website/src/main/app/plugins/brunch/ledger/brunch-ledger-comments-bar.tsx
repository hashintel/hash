import { useSyncExternalStore } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { pendingCommentsFor } from "./brunch-ledger-comments";

import type { PetrinautAiComposerControlContext } from "../chat/ai-assistant-composer-control";
import type { BrunchEditorApi } from "../editor-api-plugin";

/** Sends the user's pending Ledger comments to Brunch as one turn, from either tab. */
export const BrunchLedgerCommentsBar = ({
  context,
  net,
}: {
  context: PetrinautAiComposerControlContext;
  /** The open net, whose editor holds the pending comments. */
  net: BrunchEditorApi["document"]["net"];
}) => {
  const store = pendingCommentsFor(net, context.conversationId);
  const { comments, sending } = useSyncExternalStore(
    store.subscribe,
    store.get,
  );
  if (comments.length === 0) return null;
  const busy =
    sending === "pending" ||
    context.status === "submitted" ||
    context.status === "streaming" ||
    (sending !== "uncertain" &&
      comments.some(({ text }) => text.trim() === ""));
  return (
    <div
      role="group"
      aria-label="Ledger comments"
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "2",
        fontSize: "xs",
        color: "neutral.s100",
      })}
    >
      <span>
        {comments.length === 1
          ? "1 comment on the Ledger"
          : `${comments.length} comments on the Ledger`}
        {sending === "failed" && " could not be sent"}
        {sending === "uncertain" && " · Delivery unconfirmed; retry to check"}
      </span>
      <Button
        size="xs"
        variant="subtle"
        disabled={busy}
        onClick={() => store.send(context.submitText)}
      >
        {sending === "failed" || sending === "uncertain" ? "Retry" : "Send"}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={sending === "pending" || sending === "uncertain"}
        onClick={store.discard}
      >
        Discard
      </Button>
    </div>
  );
};
