import { Node, NodeType, Slice } from "prosemirror-model";

// /**
//  * Prosemirror doesn't know to convert hard breaks into new line characters
//  * in the plain text version of the clipboard when we copy out of the
//  * editor. In the HTML version, they get converted as their `toDOM`
//  * method instructs, but we have to use this for the plain text version.
//  *
//  * @todo find a way of not having to do this centrally
//  * @todo look into whether this is needed for mentions and for links
//  */
export const clipboardTextSerializer =
  (lineBreakNodetype?: NodeType) => (slice: Slice) => {
    return slice.content.textBetween(
      0,
      slice.content.size,
      "\n\n",
      (node: Node) => {
        if (node.type === lineBreakNodetype) {
          return "\n";
        }

        return "";
      },
    );
  };
