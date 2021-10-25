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
      text: {
        group: "inline",
      },
      hardBreak: {
        inline: true,
        group: "inline",
        selectable: false,
        parseDOM: [{ tag: "br" }],
        toDOM() {
          return ["br"];
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
      link: {
        attrs: {
          href: { default: ""},
        },
        toDOM(node) {
          let { href } = node.attrs;
          return ["a", { href, style: "color: blue; text-decoration: underline" }, 0] as const;
        },
        parseDOM: [
          {
            tag: "a[href]",
            getAttrs(dom) {
              return {
                href: dom.getAttribute("href")
              };
            },
          },
        ],
      },
    },
  });
