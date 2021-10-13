import { baseKeymap, chainCommands, toggleMark } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { history, redo, undo } from "prosemirror-history";
import { undoInputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { BlockEntity } from "./entity";
import { createSchema } from "./schema";
import { wrapEntitiesPlugin } from "./wrapEntitiesPlugin";

export const getProseMirrorNodeAttributes = (entity: BlockEntity) => ({
  entityId: entity.entityId,
});

const createInitialDoc = (schema: Schema = createSchema()) =>
  schema.node("doc", {}, [schema.node("blank")]);

/**
 * We setup two versions of the history plugin, because we occasionally
 * temporarily want to ensure that all updates made between two points are
 * absorbed into a single history item. We need a more sophisticated way of
 * manipulating history items though.
 *
 * @todo deal with this
 * @todo don't export these – export a function for swapping these
 */
export const historyPlugin = history();
export const infiniteGroupHistoryPlugin = history({ newGroupDelay: Infinity });

const defaultPlugins = [
  historyPlugin,
  keymap({ "Mod-z": chainCommands(undo, undoInputRule), "Mod-y": redo }),
  ...wrapEntitiesPlugin(baseKeymap),
  // This enables an indicator to appear when drag and dropping blocks
  dropCursor(),
];

export const createProseMirrorState = ({
  doc = createInitialDoc(),
  plugins = [],
}: {
  doc?: ProsemirrorNode;
  plugins?: Plugin[];
} = {}) => {
  const formatKeymap = keymap({
    "Mod-b": toggleMark(doc.type.schema.marks.strong),
    "Mod-i": toggleMark(doc.type.schema.marks.em),
    "Ctrl-u": toggleMark(doc.type.schema.marks.underlined),
  });

  return EditorState.create({
    doc,
    plugins: [...defaultPlugins, formatKeymap, ...plugins],
  });
};
