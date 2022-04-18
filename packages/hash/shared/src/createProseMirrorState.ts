import { baseKeymap, toggleMark } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { keymap } from "prosemirror-keymap";
import { ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { createEntityStorePlugin } from "./entityStorePlugin";
import { createSchema } from "./schema";
import { wrapEntitiesPlugin } from "./wrapEntitiesPlugin";

const createInitialDoc = (schema: Schema = createSchema()) =>
  schema.node("doc", {}, [
    schema.node("block", {}, [
      schema.node("entity", {}, [schema.node("blank")]),
    ]),
  ]);

const defaultPlugins: Plugin<any, Schema>[] = [
  ...wrapEntitiesPlugin(baseKeymap),
  // This enables an indicator to appear when drag and dropping blocks
  dropCursor(),
];

export const createProseMirrorState = ({
  accountId,
  plugins = [],
}: {
  accountId: string;
  plugins?: Plugin<any, Schema>[];
}) => {
  const schema = createSchema();
  const formatKeymap = keymap<Schema>({
    // Mod- stands for Cmd- o macOS and Ctrl- elsewhere
    "Mod-b": toggleMark(schema.marks.strong!),
    "Mod-i": toggleMark(schema.marks.em!),
    "Mod-u": toggleMark(schema.marks.underlined!),
    // We add an extra shortcut on macOS to mimic raw Chrome’s contentEditable.
    // ProseMirror normalizes keys, so we don’t get two self-cancelling handlers.
    "Ctrl-u": toggleMark(schema.marks.underlined!),

    "Shift-Enter": (state, dispatch) => {
      dispatch?.(
        state.tr
          .replaceSelectionWith(schema.nodes.hardBreak!.create())
          .scrollIntoView(),
      );
      return true;
    },
  });

  return EditorState.create<Schema>({
    // doc,
    schema,
    plugins: [
      ...defaultPlugins,
      ...plugins,
      createEntityStorePlugin({ accountId }),
      formatKeymap,
    ],
  });
};
