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
}: {
  api: BrunchEditorApi;
  messages: readonly LedgerHistoryMessage[];
}) => {
  const { selection } = useStore(api.editor.navigation);
  return (
    <BrunchLedgerPane
      messages={messages}
      selection={selection}
      onSelectNetElements={(items) =>
        api.editor.navigate((current) => ({ ...current, selection: items }))
      }
      comments={pendingCommentsFor(api.document.net)}
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
}: {
  messages: readonly LedgerHistoryMessage[];
}) => (
  <WithBrunchEditorApi>
    {(api) => <LedgerBesideCanvas api={api} messages={messages} />}
  </WithBrunchEditorApi>
);
