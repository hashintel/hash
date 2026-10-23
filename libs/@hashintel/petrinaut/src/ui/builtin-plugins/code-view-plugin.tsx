import { useState } from "react";

import { printPetrinautDsl } from "@hashintel/petrinaut-core";

import {
  formatReadOnlyReason,
  useReadOnlyReason,
} from "../../react/state/use-read-only-reason";
import { useStore } from "../../react/use-store";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "../plugins/define-petrinaut-plugin";
import { describeRefusal, type AccessApi } from "../plugins/plugin-access";
import { analyzeDslDraft, countErrors } from "./code-view/dsl-draft";
import {
  DslView,
  type DslViewStatus,
  type RevealedLines,
} from "./code-view/dsl-view";

import type { DslSpan, SelectionItem } from "@hashintel/petrinaut-core";

const CodeViewPlugin = definePetrinautPlugin({
  id: "hash.code-view",
  name: "Code view",
  description:
    "A Code tab beside Canvas and Definitions that shows the net as Petrinaut DSL text, with its components inline, and writes an edited text back to the net.",
  author: "HASH",
  access: { document: "write", editor: "read" },
  views: {
    code: {
      label: "Code",
      description: "The net as Petrinaut DSL text, editable.",
    },
  },
});

/** The lines of the span the selection names, if the DSL has one for it. */
const revealedLines = (
  spans: readonly DslSpan[],
  selection: readonly SelectionItem[],
  subnetId: string | null,
): RevealedLines => {
  const [item] = selection;
  if (item === undefined || item.type === "arc") {
    return null;
  }
  const span = spans.find(
    (candidate) =>
      candidate.kind === item.type &&
      candidate.id === item.id &&
      candidate.subnetId === subnetId,
  );
  return span ? { startLine: span.startLine, endLine: span.endLine } : null;
};

/** The text being edited, and the projection it started from. */
type Draft = { text: string; base: string };

const CodeView = ({
  api,
}: {
  api: AccessApi<{ document: "write"; editor: "read" }>;
}) => {
  const net = useStore(api.document.net);
  const title = useStore(api.document.title);
  const navigation = useStore(api.editor.navigation);
  const readOnlyReason = useReadOnlyReason();
  const [draft, setDraft] = useState<Draft | null>(null);

  const printed = printPetrinautDsl({ sdcpn: net, title });
  const analysis = draft === null ? null : analyzeDslDraft(net, draft.text);
  const status: DslViewStatus =
    readOnlyReason !== null
      ? { kind: "readOnly", reason: formatReadOnlyReason(readOnlyReason) }
      : draft === null || analysis === null
        ? { kind: "clean" }
        : {
            kind: "editing",
            errors: countErrors(analysis.diagnostics),
            stale: draft.base !== printed.text,
            canApply: analysis.net !== null,
          };

  const apply = () => {
    if (analysis === null || analysis.net === null) {
      return;
    }
    const result = api.document.edit.replaceDefinition(analysis.net);
    if (!result.applied) {
      api.notifications.add({
        id: "code-view:apply",
        message: "The text was not applied.",
        detail: describeRefusal(result.reason),
        tone: "error",
      });
      return;
    }
    if (analysis.title !== null && analysis.title !== title) {
      api.document.setTitle(analysis.title);
    }
    setDraft(null);
  };

  return (
    <DslView
      text={draft?.text ?? printed.text}
      diagnostics={analysis?.diagnostics ?? []}
      revealed={
        draft === null
          ? revealedLines(
              printed.spans,
              navigation.selection,
              navigation.subnetId,
            )
          : null
      }
      status={status}
      onChange={(text) =>
        setDraft(
          text === printed.text
            ? null
            : { text, base: draft?.base ?? printed.text },
        )
      }
      onApply={apply}
      onDiscard={() => setDraft(null)}
    />
  );
};

const useCodeViewPlugin: PluginHook<typeof CodeViewPlugin> = (api) => ({
  views: { code: <CodeView api={api} /> },
});

/**
 * Adds a **Code** tab to the view selector: the net as Petrinaut DSL, its
 * components written inline, re-printed on every change. Selecting an item
 * on the canvas or in the sidebar scrolls to its lines. Editing the text
 * marks what does not parse or resolve; Apply, or the editor's save
 * shortcut, writes the text back to the net, matched by name so every
 * entity keeps its id and position.
 */
export const codeViewPlugin = CodeViewPlugin(useCodeViewPlugin);
