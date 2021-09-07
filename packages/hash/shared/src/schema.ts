// import { Node as ProsemirrorNode, Schema } from "prosemirror-model";
import { Schema } from "prosemirror-model";

export const createSchema = () =>
  new Schema({
    nodes: {
      doc: {
        // content: "((block|entity|blockItem)+)|blank",
        content: "((block|blockItem)+)|blank",
      },
      blank: {
        toDOM: () => ["div", 0] as const,
      },
      block: {
        content: "blockItem",
        // content: "blockItem|entity",
        // attrs: { id: {} },
        /**
         * These properties are necessary for copy and paste (which is necessary for drag and drop)
         */
        toDOM: (/*node*/) => {
          return [
            "div",
            {
              "data-hash-type": "block",
              // "data-hash-id": node.attrs.id,
            },
          ] as const;
        },
        parseDOM: [
          {
            tag: 'div[data-hash-type="block"]',
            // getAttrs: (node: Node | string) =>
            //   typeof node === "string"
            //     ? {}
            //     : {
            //         id: (node as HTMLElement).getAttribute("data-hash-id"),
            //       },
          },
        ],
      },
      // entity: {
      //   content: "blockItem",
      //   attrs: { id: {} },
      //   /**
      //    * These properties are necessary for copy and paste (which is necessary for drag and drop)
      //    */
      //   toDOM: (node) => {
      //     return [
      //       "div",
      //       {
      //         "data-hash-type": "entity",
      //         "data-hash-id": node.attrs.id,
      //       },
      //       0,
      //     ] as const;
      //   },
      //   parseDOM: [
      //     {
      //       tag: 'div[data-hash-type="entity"]',
      //       getAttrs: (node: Node | string) =>
      //         typeof node === "string"
      //           ? {}
      //           : {
      //               id: (node as HTMLElement).getAttribute("data-hash-id"),
      //             },
      //     },
      //   ],
      // },
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
