/**
 * Layout documents for the HIR printers.
 *
 * A printer describes its output as a `Doc`: text, sequences, indented
 * regions and *groups* that print on one line when they fit the column
 * budget and break at their `line`s otherwise — Wadler's pretty printer in
 * the form Prettier uses. `renderDoc` lays a document out inside a width;
 * `renderFlat` keeps every group on one line.
 */

export type Doc =
  | string
  | Doc[]
  | { kind: "group"; contents: Doc; broken: boolean }
  | { kind: "indent"; contents: Doc }
  | { kind: "line"; flat: string }
  | { kind: "hardline" }
  | { kind: "ifBreak"; broken: Doc; flat: Doc };

const INDENT_WIDTH = 2;

/** A line break in a broken group; a space in a flat one. */
export const line: Doc = { kind: "line", flat: " " };

/** A line break in a broken group; nothing in a flat one. */
export const softline: Doc = { kind: "line", flat: "" };

/** An unconditional line break — every group around it breaks. */
export const hardline: Doc = { kind: "hardline" };

const containsHardline = (doc: Doc): boolean => {
  if (typeof doc === "string") {
    return false;
  }
  if (Array.isArray(doc)) {
    return doc.some(containsHardline);
  }
  switch (doc.kind) {
    case "group":
      return doc.broken;
    case "indent":
      return containsHardline(doc.contents);
    case "line":
      return false;
    case "hardline":
      return true;
    case "ifBreak":
      return containsHardline(doc.broken) || containsHardline(doc.flat);
  }
};

/** Prints on one line when the contents fit the rest of the line, and breaks
 * at every `line` directly inside otherwise (nested groups decide for
 * themselves). */
export const group = (contents: Doc): Doc => ({
  kind: "group",
  contents,
  broken: containsHardline(contents),
});

/** Indents the line breaks inside `contents` by one level. */
export const indent = (contents: Doc): Doc => ({ kind: "indent", contents });

/** `broken` when the enclosing group breaks, `flat` (nothing by default)
 * when it prints on one line. */
export const ifBreak = (broken: Doc, flat: Doc = ""): Doc => ({
  kind: "ifBreak",
  broken,
  flat,
});

export const join = (separator: Doc, docs: Doc[]): Doc =>
  docs.flatMap((doc, index) => (index === 0 ? [doc] : [separator, doc]));

type Mode = "flat" | "break";

type Command = { indentation: number; mode: Mode; doc: Doc };

const pushParts = (stack: Command[], command: Command, parts: Doc[]): void => {
  for (const part of parts.toReversed()) {
    stack.push({ ...command, doc: part });
  }
};

/** Whether `next`, printed flat, fits in `width` columns together with
 * whatever follows it on the same line (`rest` is the render stack, read
 * up to its first line break). */
const fits = (next: Command, rest: Command[], width: number): boolean => {
  let remaining = width;
  const stack = [...rest, next];
  while (remaining >= 0) {
    const command = stack.pop();
    if (command === undefined) {
      return true;
    }
    const { doc, mode } = command;
    if (typeof doc === "string") {
      remaining -= doc.length;
    } else if (Array.isArray(doc)) {
      pushParts(stack, command, doc);
    } else {
      switch (doc.kind) {
        case "group":
          stack.push({
            ...command,
            mode: doc.broken ? "break" : mode,
            doc: doc.contents,
          });
          break;
        case "indent":
          stack.push({
            ...command,
            indentation: command.indentation + INDENT_WIDTH,
            doc: doc.contents,
          });
          break;
        case "line":
          if (mode === "break") {
            return true;
          }
          remaining -= doc.flat.length;
          break;
        case "hardline":
          return true;
        case "ifBreak":
          stack.push({
            ...command,
            doc: mode === "break" ? doc.broken : doc.flat,
          });
          break;
      }
    }
  }
  return false;
};

const newline = (indentation: number): string => `\n${" ".repeat(indentation)}`;

/**
 * Lays `doc` out within `width` columns: a group prints flat when it fits
 * the rest of its line and breaks otherwise. An infinite width keeps every
 * group flat.
 */
export const renderDoc = (doc: Doc, width: number): string => {
  const out: string[] = [];
  let column = 0;
  const stack: Command[] = [{ indentation: 0, mode: "break", doc }];
  let command = stack.pop();
  while (command !== undefined) {
    const { doc: current, mode } = command;
    if (typeof current === "string") {
      out.push(current);
      column += current.length;
    } else if (Array.isArray(current)) {
      pushParts(stack, command, current);
    } else {
      switch (current.kind) {
        case "group": {
          const flat =
            mode === "flat" ||
            (!current.broken &&
              (width === Number.POSITIVE_INFINITY ||
                fits(
                  { ...command, mode: "flat", doc: current.contents },
                  stack,
                  width - column,
                )));
          stack.push({
            ...command,
            mode: flat ? "flat" : "break",
            doc: current.contents,
          });
          break;
        }
        case "indent":
          stack.push({
            ...command,
            indentation: command.indentation + INDENT_WIDTH,
            doc: current.contents,
          });
          break;
        case "line":
          if (mode === "flat") {
            out.push(current.flat);
            column += current.flat.length;
          } else {
            out.push(newline(command.indentation));
            column = command.indentation;
          }
          break;
        case "hardline":
          out.push(newline(command.indentation));
          column = command.indentation;
          break;
        case "ifBreak":
          stack.push({
            ...command,
            doc: mode === "break" ? current.broken : current.flat,
          });
          break;
      }
    }
    command = stack.pop();
  }
  return out.join("");
};

/** Renders every group on one line. */
export const renderFlat = (doc: Doc): string =>
  renderDoc(doc, Number.POSITIVE_INFINITY);
