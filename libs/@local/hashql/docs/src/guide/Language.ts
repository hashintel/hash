export const hosts = [
  {
    id: "rust",
    label: "Rust",
    grammar: "rust",
    codeblock: { title: "Rust", keepBackground: true },
  },
  {
    id: "python",
    label: "Python",
    grammar: "python",
    codeblock: { title: "Python", keepBackground: true },
  },
  {
    id: "typescript",
    label: "TypeScript",
    grammar: "typescript",
    codeblock: { title: "TypeScript", keepBackground: true },
  },
] as const;

export const queries = [
  {
    id: "draft",
    label: "Draft (TypeScript)",
    grammar: "typescript",
    codeblock: { title: "Draft (TypeScript)", keepBackground: true },
  },
  {
    id: "functional",
    label: "HashQL functional",
    grammar: "scheme",
    codeblock: { title: "HashQL functional", keepBackground: true },
  },
  {
    id: "reference",
    label: "HashQL reference",
    grammar: "hashql-reference",
    codeblock: { title: "HashQL reference", keepBackground: true },
  },
] as const;

export type Host = (typeof hosts)[number];
export type Query = (typeof queries)[number];
