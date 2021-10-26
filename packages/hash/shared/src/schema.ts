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
        content: "entity",
        /**
         * These properties are necessary for copy and paste (which is
         * necessary for drag and drop)
         */
        toDOM: () => {
          return [
            "div",
            {
              // @todo this isn't applied because of the node view
              "data-hash-type": "block",
            },
          ] as const;
        },
        parseDOM: [
          {
            // @todo is this necessary
            tag: 'div[data-hash-type="block"]',
          },
        ],
      },
      entity: {
        group: "blockItem",
        content: "blockItem",
        attrs: {
          entityId: { default: null },
          draftId: { default: null },
        },
        toDOM: () => {
          return ["div", { "data-hash-type": "entity" }, 0] as const;
        },
        parseDOM: [
          {
            tag: 'div[data-hash-type="entity"]',
          },
        ],
      },
      text: {},
      async: {
        group: "blockItem",
        attrs: {
          targetComponentId: { default: null },
          // @todo remove this
          entityId: { default: null },
          draftId: { default: null },
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
