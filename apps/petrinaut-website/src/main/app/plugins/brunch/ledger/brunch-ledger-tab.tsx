import { useStore } from "@hashintel/petrinaut/ui/plugin";

import {
  WithBrunchEditorApi,
  type BrunchEditorApi,
} from "../editor-api-plugin";
import { BrunchLedgerPane } from "./brunch-ledger-pane";

import type { BrunchLedgerHistoryMessage } from "./brunch-ledger-history";

const LedgerBesideCanvas = ({
  api,
  messages,
}: {
  api: BrunchEditorApi;
  messages: readonly BrunchLedgerHistoryMessage[];
}) => {
  const { selection } = useStore(api.editor.navigation);
  return (
    <BrunchLedgerPane
      messages={messages}
      selection={selection}
      onSelectNetElements={(items) =>
        api.editor.navigate((current) => ({ ...current, selection: items }))
      }
    />
  );
};

/**
 * The Ledger tab: reads the editor's selection through Brunch's editor plugin
 * so the Ledger explains it, and sets it from a reflection's net elements.
 */
export const BrunchLedgerTab = ({
  messages,
}: {
  messages: readonly BrunchLedgerHistoryMessage[];
}) => (
  <WithBrunchEditorApi>
    {(api) => <LedgerBesideCanvas api={api} messages={messages} />}
  </WithBrunchEditorApi>
);
