import { cloneDeep } from "lodash-es";
import { baseKeymap } from "prosemirror-commands";
import { dropCursor } from "prosemirror-dropcursor";
import { EditorState } from "prosemirror-state";

import { createEntityStorePlugin } from "./entity-store-plugin.js";
import {
  createSchema,
  formatKeymap,
  pageEditorNodes,
  textTokenNodes,
} from "./prosemirror.js";
import { wrapEntitiesPlugin } from "./wrap-entities-plugin.js";

import type { WebId } from "@blockprotocol/type-system";
import type { Node, Schema } from "prosemirror-model";
import type { Plugin } from "prosemirror-state";

const nodes = {
  doc: {
    content: "((componentNode|block)+)|loading",
  },
  ...textTokenNodes,
  ...pageEditorNodes,
};

// oxlint-disable-next-line unicorn/prefer-structured-clone -- node specs contain functions (`toDOM`, `parseDOM` callbacks), which `structuredClone` cannot copy
const clonedNodes = (): typeof nodes => cloneDeep(nodes);

const createInitialDoc = (schema: Schema = createSchema(clonedNodes())): Node =>
  schema.node("doc", {}, [schema.node("loading")]);

// eslint-disable-next-line no-restricted-syntax -- prosemirror issue
const defaultPlugins: Plugin[] = [
  ...wrapEntitiesPlugin(baseKeymap),
  // This enables an indicator to appear when drag and dropping blocks
  dropCursor(),
];

export const createProseMirrorState = ({
  webId,
  doc = createInitialDoc(),
  plugins = [],
}: {
  webId: WebId;
  doc?: Node;
  // eslint-disable-next-line no-restricted-syntax -- prosemirror issue
  plugins?: Plugin[];
}): EditorState =>
  EditorState.create({
    doc,
    plugins: [
      ...defaultPlugins,
      createEntityStorePlugin({ webId }),
      formatKeymap(doc.type.schema),
      ...plugins,
    ],
  });
