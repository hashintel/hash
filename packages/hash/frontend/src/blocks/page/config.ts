import { defineBlock } from "./utils";

export const baseSchemaConfig = {
  nodes: {
    doc: {
      content: "(block|blockItem)+",
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
    paragraph: defineBlock({
      content: "text*",
      toDOM: () => ["p", 0] as const,
      marks: "_",
    }),
    text: {},
    async: {
      group: "blockItem",
      attrs: {
        asyncNodeId: { default: null },
        asyncNodeDisplayName: { default: null },
        asyncNodeProps: { default: {} },
        asyncNodeUrl: { default: null },
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
