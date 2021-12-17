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
      /**
       * This is serialized as a new line in `createEditorView` when copying to
       * plain text
       *
       * @todo figure out out to do this here
       * @see createEditorView
       */
      hardBreak: {
        inline: true,
        group: "inline",
        selectable: false,
        parseDOM: [{ tag: "br" }],
        toDOM() {
          return ["br"];
        },
      },
      mention: {
        inline: true,
        group: "inline",
        atom: true,
        attrs: { mentionType: { default: null }, entityId: { default: null } },
        toDOM: (node) => {
          const { mentionType, entityId } = node.attrs;
          return [
            "span",
            {
              "data-hash-type": "mention",
              "data-mention-type": mentionType,
              "data-entity-id": entityId,
            },
          ] as const;
        },
        parseDOM: [
          {
            tag: 'span[data-hash-type="mention"]',
            getAttrs(dom) {
              return {
                mentionType: (dom as Element).getAttribute("data-mention-type"),
                entityId: (dom as Element).getAttribute("data-entity-id"),
              };
            },
          },
        ],
      },
    },
    marks: {
      strong: {
        toDOM: () => ["strong", { style: "font-weight:bold;" }, 0] as const,
        parseDOM: [
          { tag: "strong" },
          // This works around a Google Docs misbehavior where
          // pasted content will be inexplicably wrapped in `<b>`
          // tags with a font-weight normal.
          // @see https://github.com/ProseMirror/prosemirror-schema-basic/blob/860d60f764dcdcf186bcba0423d2c589a5e34ae5/src/schema-basic.js#L136
          {
            tag: "b",
            getAttrs: (node) => node.style.fontWeight !== "normal" && null,
          },
          {
            style: "font-weight",
            getAttrs(value) {
              if (/^(bold(er)?|[5-9]\d{2,})$/.test(value)) {
                return null;
              }
              return false;
            },
          },
        ],
      },
      em: {
        toDOM: () => ["em", 0] as const,
        parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
      },
      /**
       * Some apps export underlines as HTML includes a style tag
       * creating some classes, which are then applied to the underlined
       * text. This includes Pages. It has not yet been figured out how to
       * handle this within Prosemirror, so this formatting will be lost
       * when pasting from these apps.
       *
       * @todo fix this
       */
      underlined: {
        toDOM: () => ["u", 0] as const,
        parseDOM: [
          { tag: "u" },
          { style: "text-decoration=underline" },
          { style: "text-decoration-line=underline" },
        ],
      },
      link: {
        attrs: {
          href: { default: "" },
        },
        inclusive: false,
        toDOM(node) {
          const { href } = node.attrs;
          return [
            "a",
            { href, style: "color: blue; text-decoration: underline" },
            0,
          ] as const;
        },
        parseDOM: [
          {
            tag: "a[href]",
            getAttrs(dom) {
              return {
                href: (dom as Element).getAttribute("href"),
              };
            },
          },
        ],
      },
    },
  });
