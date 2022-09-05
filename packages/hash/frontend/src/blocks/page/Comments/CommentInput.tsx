import { FunctionComponent, useEffect, useRef, useState } from "react";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
// import { createSchema } from "@hashintel/hash-shared/prosemirror";
import { Fragment, Schema, DOMParser } from "prosemirror-model";
// import { faAt } from "@fortawesome/free-solid-svg-icons";
import applyDevTools from "prosemirror-dev-tools";
import { usePortals } from "../usePortals";
import { createFormatPlugins } from "../createFormatPlugins";

type CommentInputProps = {};

export const CommentInput: FunctionComponent<CommentInputProps> = () => {
  const viewRef = useRef<EditorView<Schema>>();
  const [portals, renderPortal, clearPortals] = usePortals();

  useEffect(() => {
    // const schema = createSchema();
    setupProsemirror();
  }, []);

  const setupProsemirror = () => {
    const textSchema = new Schema({
      nodes: {
        doc: { content: "text*" },
        text: {
          group: "inline",
        },
        mention: {
          inline: true,
          group: "inline",
          atom: true,
          attrs: {
            mentionType: { default: null },
            entityId: { default: null },
          },
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
                  mentionType: (dom as Element).getAttribute(
                    "data-mention-type",
                  ),
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
            /**
             * This works around a Google Docs misbehavior where
             * pasted content will be inexplicably wrapped in `<b>`
             * tags with a font-weight normal.
             * @see https://github.com/ProseMirror/prosemirror-schema-basic/blob/860d60f764dcdcf186bcba0423d2c589a5e34ae5/src/schema-basic.js#L136
             */
            {
              tag: "b",
              getAttrs: (node) => {
                /**
                 * It is always a Node for tag rules but the types aren't
                 * smart enough for that
                 *
                 * @todo remove the need for this cast
                 */
                const castNode = node as unknown as HTMLElement;

                return castNode.style.fontWeight !== "normal" && null;
              },
            },
            {
              style: "font-weight",
              getAttrs(value) {
                /**
                 * It is always a string for style rules but the types aren't
                 * smart enough for that
                 *
                 * @todo remove the need for this cast
                 */
                const castValue = value as unknown as string;
                if (/^(bold(er)?|[5-9]\d{2,})$/.test(castValue)) {
                  return null;
                }
                return false;
              },
            },
          ],
        },
        em: {
          toDOM: () => ["em", 0] as const,
          parseDOM: [
            { tag: "em" },
            { tag: "i" },
            { style: "font-style=italic" },
          ],
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

    const state = EditorState.create<Schema>({
      doc:
        // textSchema.node("doc", {}, [
        //   textSchema.node(
        //     "text",
        //     {},
        DOMParser.fromSchema(textSchema).parse(
          document.querySelector("#editor")!,
        ),
      // ),
      // ]),
      plugins: [...createFormatPlugins(renderPortal)],
    });

    state.doc.text = "heeey";

    const view = new EditorView<Schema>(document.querySelector("#editor")!, {
      state,
    });

    // applyDevTools(view);
    console.log(view);
    viewRef.current = view;
  };

  console.log(viewRef.current);

  return (
    <div id="editor" style={{ height: 100 }}>
      hey
      {portals}
    </div>
  );
};
