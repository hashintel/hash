import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { DirectEditorProps, EditorView } from "prosemirror-view";
import { RenderPortal } from "./usePortals";
import { mentionNodeView } from "./MentionView/MentionNodeView";
import { clipboardTextSerializer } from "./clipboardTextSerializer";

export const createTextEditorView = (
  state: EditorState<Schema>,
  renderNode: HTMLElement,
  renderPortal: RenderPortal,
  accountId: string,
  editorProps?: Partial<DirectEditorProps<Schema>>,
) =>
  new EditorView<Schema>(renderNode, {
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
