import { Schema } from "prosemirror-model";

export const createSchema = () =>
  new Schema({
    nodes: {
      doc: {
        content: "((block|blockItem)+)|blank",
      },
      blank: {
        toDOM: () => ["div", 0] as const,
      },
      block: {
        content: "blockItem",
        /**
         * These properties are necessary for copy and paste (which is necessary for drag and drop)
         */
        toDOM: () => {
          return [
            "div",
            {
              "data-hash-type": "block",
            },
          ] as const;
        },
        parseDOM: [
          {
            tag: 'div[data-hash-type="block"]',
          },
        ],
      },
      text: {},
      async: {
        group: "blockItem",
        attrs: {
          // @todo rename these props
          asyncNodeProps: { default: {} },
          asyncNodeUrl: { default: null },
          autofocus: { default: true },
        },
      },
    },
    marks: {
      strong: {
        toDOM: () => ["strong", { style: "font-weight:bold;" }, 0] as const,
      },
      em: {
        toDOM: () => ["em", 0] as const,
      },
      underlined: {
        toDOM: () => ["u", 0] as const,
      },
    },
  });

export const createInitialDoc = (schema: Schema) =>
  schema.node("doc", {}, [schema.node("blank")]);
