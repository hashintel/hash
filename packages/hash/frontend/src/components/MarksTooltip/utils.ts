import { Mark, MarkType, Schema } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";

export function getMarkType(
  nameOrType: string | MarkType,
  schema: Schema
): MarkType {
  if (typeof nameOrType === "string") {
    if (!schema.marks[nameOrType]) {
      throw Error(
        `There is no mark type named '${nameOrType}'. Maybe you forgot to add the extension?`
      );
    }

    return schema.marks[nameOrType];
  }

  return nameOrType;
}

export function getMarkAttributes(
  state: EditorState,
  typeOrName: string | MarkType
): Record<string, any> {
  const type = getMarkType(typeOrName, state.schema);
  const { from, to, empty } = state.selection;
  const marks: Mark[] = [];

  if (empty) {
    if (state.storedMarks) {
      marks.push(...state.storedMarks);
    }

    marks.push(...state.selection.$head.marks());
  } else {
    state.doc.nodesBetween(from, to, (node) => {
      marks.push(...node.marks);
    });
  }

  const mark = marks.find((markItem) => markItem.type.name === type.name);

  if (!mark) {
    return {};
  }

  return { ...mark.attrs };
}

export const setMark =
  (typeOrName: string | MarkType, attributes = {}) =>
  ({
    tr,
    state,
    dispatch,
  }: {
    tr: Transaction;
    state: EditorState;
    dispatch?: (args?: any) => any;
  }) => {
    const { selection } = tr;
    const { empty, ranges } = selection;
    const type = getMarkType(typeOrName, state.schema);

    if (dispatch) {
      if (empty) {
        const oldAttributes = getMarkAttributes(state, type);

        tr.addStoredMark(
          type.create({
            ...oldAttributes,
            ...attributes,
          })
        );
      } else {
        ranges.forEach((range) => {
          const from = range.$from.pos;
          const to = range.$to.pos;

          state.doc.nodesBetween(from, to, (node, pos) => {
            const trimmedFrom = Math.max(pos, from);
            const trimmedTo = Math.min(pos + node.nodeSize, to);
            const someHasMark = node.marks.find((mark) => mark.type === type);

            // if there is already a mark of this type
            // we know that we have to merge its attributes
            // otherwise we add a fresh new mark
            if (someHasMark) {
              node.marks.forEach((mark) => {
                if (type === mark.type) {
                  tr.addMark(
                    trimmedFrom,
                    trimmedTo,
                    type.create({
                      ...mark.attrs,
                      ...attributes,
                    })
                  );
                }
              });
            } else {
              tr.addMark(trimmedFrom, trimmedTo, type.create(attributes));
            }
          });
        });
      }
    }

    return true;
  };

export function setLink(from: number, to: number, href?: string) {
  return (state: EditorState, dispatch) => {
    href = href && href.trim();
    // @todo check if there's text at that position
    const linkMark = state.schema.marks.link;
    let tr = state.tr.removeMark(from, to, linkMark);
    if (href) {
      const mark = state.schema.marks.link.create({
        href: href,
      });
      tr.addMark(from, to, mark);
    }

    if (dispatch) {
      dispatch(tr);
    }
    return true;
  };
}

export function createLink(href: string) {
  return (state: EditorState, dispatch) => {
    // @todo run queryIsLinKAllowedInRange
    const [from, to] = [state.selection.$from.pos, state.selection.$to.pos];
    const linkMark = state.schema.marks.link;
    let tr = state.tr.removeMark(from, to, linkMark);

    if (href.trim()) {
      const mark = state.schema.marks.link.create({
        href: href,
      });
      tr.addMark(from, to, mark);
    }

    if (dispatch) {
      dispatch(tr);
    }
    return true;
  };
}

export function updateLink(href: string) {
  return (state: EditorState, dispatch) => {
    if (!state.selection.empty) {
      return setLink(
        state.selection.$from.pos,
        state.selection.$to.pos,
        href
      )(state, dispatch);
    }
  };
}
