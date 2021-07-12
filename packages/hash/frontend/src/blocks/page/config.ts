import { defineBlock } from "./utils";

export const baseSchemaConfig = {
  nodes: {
    doc: {
      content: "((block|blockItem)+)|blank",
    },
    blank: {
      toDOM: () => ["div", 0] as const
    },
    // @todo not sure i want this block to appear in the HTML
    // @todo fix copy & paste
    block: {
      content: "blockItem",
      // defining: true
      // selectable: false,
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
        asyncNodeId: { default: null },
        asyncNodeDisplayName: { default: null },
        asyncNodeProps: { default: {} },
        asyncNodeUrl: { default: null },
        autofocus: { default: true },
      },
    },
    // heading: defineBlock({
    //   content: "text*",
    //   toDOM: () => ["h3", 0],
    //   marks: "",
    // }),
  },
  marks: {
    strong: {
      toDOM: () => ["strong", 0] as const,
    },
    em: {
      toDOM: () => ["em", 0] as const,
    },
    underlined: {
      toDOM: () => ["u", 0] as const,
    },
  },
};
