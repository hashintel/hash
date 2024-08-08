import type { OwnedById } from "@local/hash-graph-types/web";
import { cloneDeep } from "lodash-es";
import { baseKeymap } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import type { Node, Schema } from "prosemirror-model";
import type { Plugin } from "prosemirror-state";
import { EditorState } from "prosemirror-state";

import { createEntityStorePlugin } from "./entity-store-plugin.js";
import {
  createSchema,
  formatKeymap,
  pageEditorNodes,
  textTokenNodes,
} from "./prosemirror.js";
import { wrapEntitiesPlugin } from "./wrap-entities-plugin.js";

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
  ownedById,
  doc = createInitialDoc(),
  plugins = [],
}: {
  ownedById: OwnedById;
  doc?: Node;
  plugins?: Plugin<unknown>[];
}) => {
  return EditorState.create({
    doc,
    plugins: [
      ...defaultPlugins,
      createEntityStorePlugin({ ownedById }),
      formatKeymap(doc.type.schema),
      ...plugins,
    ],
  });
};
