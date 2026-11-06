import { useStore } from "@hashintel/petrinaut/ui/plugin";

import {
  WithBrunchEditorApi,
  type BrunchEditorApi,
} from "../editor-api-plugin";
import { pendingCommentsFor } from "./brunch-ledger-comments";
import { BrunchLedgerPane } from "./brunch-ledger-pane";

import type { LedgerHistoryMessage } from "@hashintel/brunch-agent";

const LedgerBesideCanvas = ({
  api,
  messages,
  conversationId,
  highlightChanges,
}: {
  api: BrunchEditorApi;
  conversationId: string;
  messages: readonly LedgerHistoryMessage[];
  highlightChanges: boolean;
}) => {
  const { selection } = useStore(api.editor.navigation);
  return (
    <BrunchLedgerPane
      messages={messages}
      highlightChanges={highlightChanges}
      selection={selection}
      onSelectNetElements={(items) =>
        api.editor.navigate((current) => ({ ...current, selection: items }))
      }
      comments={pendingCommentsFor(api.document.net, conversationId)}
    />
  );
};

/**
 * The Ledger tab: reads the editor's selection through Brunch's editor plugin
 * so the Ledger explains it, and sets it from a reflection's net elements.
 * Comments written here wait in the editor until the composer sends them.
 */
export const BrunchLedgerTab = ({
  messages,
  conversationId,
  highlightChanges = true,
}: {
  messages: readonly LedgerHistoryMessage[];
  conversationId: string;
  /** Mark what the latest turn changed; off once the user has moved past it. */
  highlightChanges?: boolean;
}) => (
  <WithBrunchEditorApi>
    {(api) => (
      <LedgerBesideCanvas
        key={conversationId}
        api={api}
        messages={messages}
        conversationId={conversationId}
        highlightChanges={highlightChanges}
      />
    )}
  </WithBrunchEditorApi>
);
