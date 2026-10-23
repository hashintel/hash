import { printPetrinautDsl } from "@hashintel/petrinaut-core";

import { useStore } from "../../react/use-store";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "../plugins/define-petrinaut-plugin";
import { DslView, type RevealedLines } from "./code-view/dsl-view";

import type { AccessApi } from "../plugins/plugin-access";
import type { DslSpan, SelectionItem } from "@hashintel/petrinaut-core";

const CodeViewPlugin = definePetrinautPlugin({
  id: "hash.code-view",
  name: "Code view",
  description:
    "A Code tab beside Canvas and Definitions that shows the net as Petrinaut DSL text, with its components inline. Read-only.",
  author: "HASH",
  access: { document: "read", editor: "read" },
  views: {
    code: {
      label: "Code",
      description: "The net as Petrinaut DSL text, read-only.",
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

const CodeView = ({
  api,
}: {
  api: AccessApi<{ document: "read"; editor: "read" }>;
}) => {
  const net = useStore(api.document.net);
  const title = useStore(api.document.title);
  const navigation = useStore(api.editor.navigation);
  const { text, spans } = printPetrinautDsl({ sdcpn: net, title });
  const revealed = revealedLines(
    spans,
    navigation.selection,
    navigation.subnetId,
  );

  return <DslView text={text} spans={spans} revealed={revealed} />;
};

const useCodeViewPlugin: PluginHook<typeof CodeViewPlugin> = (api) => ({
  views: { code: <CodeView api={api} /> },
});

/**
 * Adds a **Code** tab to the view selector: the net as Petrinaut DSL, its
 * components written inline, re-printed on every change and read-only.
 * Selecting an item on the canvas or in the sidebar scrolls to its lines.
 */
export const codeViewPlugin = CodeViewPlugin(useCodeViewPlugin);
