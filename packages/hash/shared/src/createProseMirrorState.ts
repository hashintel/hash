import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { history, redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { Schema } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { entityStorePlugin } from "./entityStorePlugin";
import { ProsemirrorNode } from "./node";
import { createSchema } from "./schema";
import { wrapEntitiesPlugin } from "./wrapEntitiesPlugin";

const createInitialDoc = (schema: Schema = createSchema()) =>
  schema.node("doc", {}, [schema.node("blank")]);

const defaultPlugins: Plugin<any, Schema>[] = [
  entityStorePlugin,
  history(),
  keymap<Schema>({
    "Mod-z": chainCommands(undo, undoInputRule),
    "Mod-y": redo,
  }),
  ...wrapEntitiesPlugin(baseKeymap),
  // This enables an indicator to appear when drag and dropping blocks
  dropCursor(),
];

export const createProseMirrorState = ({
  doc = createInitialDoc(),
  plugins = [],
}: {
  doc?: ProsemirrorNode<Schema>;
  plugins?: Plugin<any, Schema>[];
} = {}) => {
  const formatKeymap = keymap<Schema>({
    // Mod- stands for Cmd- o macOS and Ctrl- elsewhere
    "Mod-b": toggleMark(doc.type.schema.marks.strong),
    "Mod-i": toggleMark(doc.type.schema.marks.em),
    "Mod-u": toggleMark(doc.type.schema.marks.underlined),
    // We add an extra shortcut on macOS to mimic raw Chrome’s contentEditable.
    // ProseMirror normalizes keys, so we don’t get two self-cancelling handlers.
    "Ctrl-u": toggleMark(doc.type.schema.marks.underlined),

    "Shift-Enter": (state, dispatch) => {
      dispatch?.(
        state.tr
          .replaceSelectionWith(doc.type.schema.nodes.hardBreak.create())
          .scrollIntoView(),
      );
      return true;
    },
  });

  return EditorState.create<Schema>({
    doc,
    plugins: [...defaultPlugins, formatKeymap, ...plugins],
  });
};
