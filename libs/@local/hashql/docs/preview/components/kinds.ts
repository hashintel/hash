import { HashSet } from "effect";

/** The letter a glyph shows for each kind, such as `f` for a function. */
export const letters: Readonly<Record<string, string>> = {
  function: "f",
  const: "v",
  interface: "I",
  type: "T",
  class: "C",
  enum: "E",
  property: "p",
  method: "m",
  accessor: "a",
  enumMember: "e",
  module: "M",
  entrypoint: "@",
  namespace: "N",
  trait: "t",
};

/** The kinds whose heading names a member, which starts with no keyword. */
const members = HashSet.make("property", "method", "accessor", "enumMember");

/** The keyword a declaration of `kind` starts with, for a heading that reads like code. */
export const keywordOf = (kind: string): string =>
  HashSet.has(members, kind) ? "" : kind;
