import { cloneDeep } from "lodash";
import { baseKeymap } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { Node, Schema } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";

import { createEntityStorePlugin } from "./entity-store-plugin";
import {
  createSchema,
  formatKeymap,
  pageEditorNodes,
  textTokenNodes,
} from "./prosemirror";
import { wrapEntitiesPlugin } from "./wrap-entities-plugin";

const nodes = {
  doc: {
    content: "((componentNode|block)+)|loading",
  },
  ...textTokenNodes,
  ...pageEditorNodes,
};

const createInitialDoc = (schema: Schema = createSchema(cloneDeep(nodes))) =>
  schema.node("doc", {}, [schema.node("loading")]);

const defaultPlugins: Plugin<unknown>[] = [
  ...wrapEntitiesPlugin(baseKeymap),
  // This enables an indicator to appear when drag and dropping blocks
  dropCursor(),
];

export const createProseMirrorState = ({
  accountId,
  doc = createInitialDoc(),
  plugins = [],
}: {
  accountId: string;
  doc?: Node;
  plugins?: Plugin<unknown>[];
}) => {
  return EditorState.create({
    doc,
    plugins: [
      ...defaultPlugins,
      createEntityStorePlugin({ accountId }),
      formatKeymap(doc.type.schema),
      ...plugins,
    ],
  });
};
