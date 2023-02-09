import { AccountId } from "@local/hash-types";
import { EditorState } from "prosemirror-state";
import { DirectEditorProps, EditorView } from "prosemirror-view";

import { RenderPortal } from "./block-portals";
import { clipboardTextSerializer } from "./clipboard-text-serializer";
import { mentionNodeView } from "./mention-view/mention-node-view";

export const createTextEditorView = (
  state: EditorState,
  renderNode: HTMLElement,
  renderPortal: RenderPortal,
  accountId: AccountId,
  editorProps?: Partial<DirectEditorProps>,
) =>
  new EditorView(renderNode, {
    ...editorProps,
    state,
    clipboardTextSerializer: clipboardTextSerializer(
      state.schema.nodes.hardBreak,
    ),
    nodeViews: {
      ...(editorProps?.nodeViews ?? {}),
      mention: mentionNodeView(renderPortal, accountId),
    },
  });
