import { useStore } from "@hashintel/petrinaut/ui/plugin";

import {
  WithBrunchEditorApi,
  type BrunchEditorApi,
} from "../editor-api-plugin";
import { pendingCommentsFor } from "./brunch-ledger-comments";
import { BrunchLedgerPane } from "./brunch-ledger-pane";

import type { LedgerHistoryMessage } from "@hashintel/brunch-agent";
import type { SDCPN } from "@hashintel/petrinaut-core";

const LedgerBesideCanvas = ({
  api,
  messages,
  conversationId,
  highlightChanges,
  openNet,
}: {
  api: BrunchEditorApi;
  conversationId: string;
  messages: readonly LedgerHistoryMessage[];
  highlightChanges: boolean;
  openNet?: SDCPN;
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
      {...(openNet === undefined ? {} : { openVersion: openNet })}
    />
  );
};

/** The Ledger beside the canvas, following the open net to mark what it lacks. */
const LedgerBesideLoadedVersion = (
  props: Omit<Parameters<typeof LedgerBesideCanvas>[0], "openNet">,
) => {
  const net = useStore(props.api.document.net);
  return <LedgerBesideCanvas {...props} openNet={net} />;
};

/**
 * The Ledger tab: reads the editor's selection through Brunch's editor plugin
 * so the Ledger explains it, and sets it from a reflection's net elements.
 * Comments written here wait in the editor until the composer sends them.
 * After the host loads another saved version, it marks the reflections on
 * elements the open net lacks.
 */
export const BrunchLedgerTab = ({
  messages,
  conversationId,
  highlightChanges = true,
  versionLoaded = false,
}: {
  messages: readonly LedgerHistoryMessage[];
  conversationId: string;
  /** Mark what the latest turn changed; off once the user has moved past it. */
  highlightChanges?: boolean;
  /** The host has loaded another saved version of the net, which the open net builds on. */
  versionLoaded?: boolean;
}) => (
  <WithBrunchEditorApi>
    {(api) =>
      versionLoaded ? (
        <LedgerBesideLoadedVersion
          key={conversationId}
          api={api}
          messages={messages}
          conversationId={conversationId}
          highlightChanges={highlightChanges}
        />
      ) : (
        <LedgerBesideCanvas
          key={conversationId}
          api={api}
          messages={messages}
          conversationId={conversationId}
          highlightChanges={highlightChanges}
        />
      )
    }
  </WithBrunchEditorApi>
);
