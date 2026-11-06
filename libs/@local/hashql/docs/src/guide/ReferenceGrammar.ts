const identifier = String.raw`[\p{L}_][\p{L}\p{M}\p{N}_]*`;

const string = {
  name: "string.quoted.double.hashql",
  begin: '"',
  end: '"',
  patterns: [
    {
      match: String.raw`\\(?:u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2}|.)`,
      name: "constant.character.escape.hashql",
    },
  ],
};

/** The reference notation's TextMate form, for the interactive comparison. */
export const grammar = {
  name: "hashql-reference",
  scopeName: "source.hashql",
  repository: {},
  patterns: [
    { match: "//.*$", name: "comment.line.double-slash.hashql" },
    string,
    {
      begin: String.raw`#\[`,
      end: String.raw`\]`,
      name: "meta.annotation.hashql",
      patterns: [
        string,
        { match: identifier, name: "keyword.control.hashql" },
        { match: "[(),=]", name: "punctuation.hashql" },
      ],
    },
    { match: String.raw`'let\b`, name: "keyword.control.hashql" },
    { match: `'${identifier}`, name: "variable.other.hashql" },
    { match: String.raw`\$exists\b`, name: "keyword.control.hashql" },
    {
      match: String.raw`[$?]${identifier}\b`,
      name: "variable.parameter.input.hashql",
    },
    {
      match: `::${identifier}(?:::${identifier})*`,
      name: "variable.other.path.hashql",
    },
    {
      match: String.raw`\b(?:let|type|newtype|in|if|then|else|match|is|thunk)\b`,
      name: "keyword.control.hashql",
    },
    { match: String.raw`\bas\b!?`, name: "keyword.operator.hashql" },
    {
      match: String.raw`\b(?:true|false|null)\b`,
      name: "constant.language.hashql",
    },
    {
      match: String.raw`(?:${identifier})?\?[0-9]+\b|\b_[0-9]+\b`,
      name: "entity.name.type.diagnostic.hashql",
    },
    {
      match: String.raw`%[0-9]+\b|\b${identifier}:[0-9]+\b`,
      name: "variable.other.diagnostic.hashql",
    },
    {
      match: String.raw`\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b`,
      name: "constant.numeric.hashql",
    },
    {
      match: String.raw`\b[A-Z][\p{L}\p{M}\p{N}_]*\b`,
      name: "entity.name.type.hashql",
    },
    {
      match: String.raw`\.\.\.(?=\s*(?:${identifier}|\(|\{))`,
      name: "keyword.operator.hashql",
    },
    { match: String.raw`\.\.\.|…`, name: "comment.block.omission.hashql" },
    {
      match: String.raw`\.\.|@|\+\+|\|>|->|&&|\|\||==|!=|<=|>=|[!~?<>&|=\-]`,
      name: "keyword.operator.hashql",
    },
    { match: String.raw`[()\[\]{},.:]`, name: "punctuation.hashql" },
    { match: identifier, name: "variable.other.hashql" },
  ],
};
