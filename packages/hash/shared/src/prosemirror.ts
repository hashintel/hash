import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { BlockEntity } from "./entity";
import { history } from "./history";
import { createSchema } from "./schema";
import { wrapEntitiesPlugin } from "./wrapEntitiesPlugin";

export const getProseMirrorNodeAttributes = (entity: BlockEntity) => ({
  entityId: entity.entityId,
});

const createInitialDoc = (schema: Schema = createSchema()) =>
  schema.node("doc", {}, [schema.node("blank")]);

const defaultPlugins: Plugin<unknown, Schema>[] = [
  history.plugin,
  keymap<Schema>({
    "Mod-z": chainCommands(undo, undoInputRule),
    "Mod-y": redo,
  }),
  ...wrapEntitiesPlugin(baseKeymap),
  // This enables an indicator to appear when drag and dropping blocks
  dropCursor() as Plugin<unknown, Schema>,
];

export const createProseMirrorState = ({
  doc = createInitialDoc(),
  plugins = [],
}: {
  doc?: ProsemirrorNode<Schema>;
  plugins?: Plugin<unknown, Schema>[];
} = {}) => {
  const formatKeymap = keymap<Schema>({
    "Mod-b": toggleMark(doc.type.schema.marks.strong),
    "Mod-i": toggleMark(doc.type.schema.marks.em),
    "Ctrl-u": toggleMark(doc.type.schema.marks.underlined),
  });

  return EditorState.create<Schema>({
    doc,
    plugins: [...defaultPlugins, formatKeymap, ...plugins],
  });
};
