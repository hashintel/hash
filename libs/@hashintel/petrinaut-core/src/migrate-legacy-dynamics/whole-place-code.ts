/**
 * The ambient names of a dynamics body's input, as `hir/user-code-form.ts`
 * declares them: `tokens`, which code written for the whole place reads,
 * and `token`, which a one-token body reads. Spelled out here because this
 * module runs in the editor's main bundle, which must not reach the
 * TypeScript compiler that module imports; the rewrite scans the text
 * instead.
 */
const TOKENS = "tokens";
const TOKEN = "token";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const WORD = /(?<![\w$])[A-Za-z_$][\w$]*/g;
const OPENERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set(Object.values(OPENERS));

/**
 * The text with every comment and string literal blanked to spaces, line
 * breaks kept, so that words and brackets can be matched by position
 * without parsing the code. Template expressions keep their text.
 */
const maskLiterals = (text: string): string => {
  const out = text.split("");
  const blank = (from: number, to: number): void => {
    for (let index = from; index < Math.min(to, text.length); index += 1) {
      if (out[index] !== "\n") {
        out[index] = " ";
      }
    }
  };
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "/" && next === "/") {
      const end = text.indexOf("\n", index);
      const to = end === -1 ? text.length : end;
      blank(index, to);
      index = to;
    } else if (char === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      const to = end === -1 ? text.length : end + 2;
      blank(index, to);
      index = to;
    } else if (char === "'" || char === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== char && text[end] !== "\n") {
        end += text[end] === "\\" ? 2 : 1;
      }
      blank(index + 1, end);
      index = end + 1;
    } else if (char === "`") {
      let end = index + 1;
      let depth = 0;
      while (end < text.length && (depth > 0 || text[end] !== "`")) {
        if (depth === 0 && text[end] === "\\") {
          blank(end, end + 2);
          end += 2;
        } else if (depth === 0 && text[end] === "$" && text[end + 1] === "{") {
          depth = 1;
          end += 2;
        } else {
          if (depth > 0) {
            depth += text[end] === "{" ? 1 : text[end] === "}" ? -1 : 0;
          } else {
            blank(end, end + 1);
          }
          end += 1;
        }
      }
      index = end + 1;
    } else {
      index += 1;
    }
  }
  return out.join("");
};

/** The index of the bracket closing the one at `open`, or null. */
const matchClose = (masked: string, open: number): number | null => {
  const stack: string[] = [];
  for (let index = open; index < masked.length; index += 1) {
    const char = masked[index]!;
    const closer = OPENERS[char];
    if (closer !== undefined) {
      stack.push(closer);
    } else if (CLOSERS.has(char)) {
      if (stack.pop() !== char) {
        return null;
      }
      if (stack.length === 0) {
        return index;
      }
    }
  }
  return null;
};

/** Whether a comma sits outside every bracket of the masked text. */
const hasTopLevelComma = (masked: string): boolean => {
  let depth = 0;
  for (const char of masked) {
    if (char in OPENERS) {
      depth += 1;
    } else if (CLOSERS.has(char)) {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      return true;
    }
  }
  return false;
};

/** How many times the identifier `word` occurs in the masked text. */
const countWord = (masked: string, word: string): number =>
  (masked.match(WORD) ?? []).filter((found) => found === word).length;

/** Whether nothing but an optional `;` and white space is left. */
const endsStatement = (masked: string): boolean => {
  const rest = masked.trim();
  return rest === "" || rest === ";";
};

/** The position of the nearest non-blank character before `index`, or -1. */
const solidBefore = (masked: string, index: number): number => {
  let at = index - 1;
  while (at >= 0 && masked[at]!.trim() === "") {
    at -= 1;
  }
  return at;
};

/** The position of the first non-blank character from `index` on. */
const solidFrom = (masked: string, index: number): number => {
  let at = index;
  while (at < masked.length && masked[at]!.trim() === "") {
    at += 1;
  }
  return at;
};

/**
 * Removes the indentation the lines after the first share, so text lifted
 * out of a nested block or literal sits at the top level.
 */
const dedent = (text: string): string => {
  const [first = "", ...rest] = text.split("\n");
  const indents = rest
    .filter((line) => line.trim() !== "")
    .map((line) => line.length - line.trimStart().length);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  return [
    first,
    ...rest.map((line) =>
      line.slice(Math.min(common, line.length - line.trimStart().length)),
    ),
  ].join("\n");
};

/** A region of code and its masked twin, kept in step. */
type MaskedCode = { text: string; masked: string };

const slice = (body: MaskedCode, from: number, to: number): MaskedCode => ({
  text: body.text.slice(from, to),
  masked: body.masked.slice(from, to),
});

const MODULE_HEADER =
  /^\s*export\s+default\s+Dynamics\s*\(\s*(?:\(\s*tokens\s*(?:,\s*parameters\s*)?\)|tokens)\s*=>\s*/;

/**
 * The statements of `export default Dynamics((tokens, parameters) => …)`
 * as a bare body, with the comments above the export kept apart, or the
 * body itself when it is one already. Null for a module whose callback
 * renames its parameters or is not that call.
 */
const asBareBody = (
  body: MaskedCode,
): { leading: string; body: MaskedCode } | null => {
  const header = MODULE_HEADER.exec(body.masked);
  if (header === null) {
    return /\bexport\b/.test(body.masked) ? null : { leading: "", body };
  }
  const exportAt = header[0].indexOf("export");
  const leading = body.text.slice(0, exportAt);
  const callOpen = body.masked.indexOf("(", header[0].indexOf("Dynamics"));
  const callClose = matchClose(body.masked, callOpen);
  const bodyStart = header[0].length;
  if (callClose === null || !endsStatement(body.masked.slice(callClose + 1))) {
    return null;
  }
  if (body.masked[bodyStart] === "{") {
    const blockClose = matchClose(body.masked, bodyStart);
    if (
      blockClose === null ||
      body.masked.slice(blockClose + 1, callClose).trim() !== ""
    ) {
      return null;
    }
    return { leading, body: slice(body, bodyStart + 1, blockClose) };
  }
  const expression = slice(body, bodyStart, callClose);
  return {
    leading,
    body: {
      text: `return ${expression.text.trim()};`,
      masked: `return ${expression.masked.trim()};`,
    },
  };
};

type Callback = {
  /** The token parameter: a name, an object pattern, or none. */
  parameter:
    | { kind: "name"; name: string }
    | { kind: "pattern"; pattern: MaskedCode }
    | null;
  /** The callback's own statements, or the expression it returns. */
  body: { kind: "block" | "expression"; text: string; masked: string };
};

const ARROW = /^\s*(?:\(([\s\S]*?)\)|([A-Za-z_$][\w$]*))\s*=>\s*/;

/** The arrow function `tokens.map` is called with, or null when it is not one. */
const parseCallback = (args: MaskedCode): Callback | null => {
  if (hasTopLevelComma(args.masked)) {
    return null;
  }
  const arrow = ARROW.exec(args.masked);
  if (arrow === null) {
    return null;
  }
  let parametersText: string;
  let parametersMasked: string;
  let bodyStart: number;
  if (arrow[1] === undefined) {
    parametersText = arrow[2] ?? "";
    parametersMasked = parametersText;
    bodyStart = arrow[0].length;
  } else {
    const parametersOpen = args.masked.indexOf("(");
    const parametersClose = matchClose(args.masked, parametersOpen);
    const afterParameters =
      parametersClose === null
        ? null
        : /^\s*=>\s*/.exec(args.masked.slice(parametersClose + 1));
    if (parametersClose === null || afterParameters === null) {
      return null;
    }
    parametersText = args.text
      .slice(parametersOpen + 1, parametersClose)
      .trim();
    parametersMasked = args.masked
      .slice(parametersOpen + 1, parametersClose)
      .trim();
    bodyStart = parametersClose + 1 + afterParameters[0].length;
  }

  let parameter: Callback["parameter"];
  if (parametersText === "") {
    parameter = null;
  } else if (IDENTIFIER.test(parametersText)) {
    parameter = { kind: "name", name: parametersText };
  } else if (
    parametersMasked.startsWith("{") &&
    matchClose(parametersMasked, 0) === parametersMasked.length - 1
  ) {
    parameter = {
      kind: "pattern",
      pattern: { text: parametersText, masked: parametersMasked },
    };
  } else {
    return null;
  }

  const rest = slice(args, bodyStart, args.text.length);
  const lastIndex = rest.masked.trimEnd().length - 1;
  if (rest.masked.trimStart().startsWith("{")) {
    const blockOpen = rest.masked.indexOf("{");
    if (matchClose(rest.masked, blockOpen) !== lastIndex) {
      return null;
    }
    return {
      parameter,
      body: {
        kind: "block",
        text: rest.text.slice(blockOpen + 1, lastIndex),
        masked: rest.masked.slice(blockOpen + 1, lastIndex),
      },
    };
  }
  const expression = slice(rest, 0, lastIndex + 1);
  const parenthesized =
    expression.masked.trimStart().startsWith("(") &&
    matchClose(expression.masked, expression.masked.indexOf("(")) === lastIndex;
  const inner = parenthesized
    ? slice(expression, expression.masked.indexOf("(") + 1, lastIndex)
    : expression;
  return {
    parameter,
    body: { kind: "expression", text: inner.text.trim(), masked: inner.masked },
  };
};

/**
 * The locals the code reads or declares: every identifier that is neither
 * a property access nor the key of an object literal entry. One pass, so a
 * caller checks any number of names against it.
 */
const referencedNames = (masked: string): Set<string> => {
  const names = new Set<string>();
  for (const { 0: word, index } of masked.matchAll(WORD)) {
    const before = solidBefore(masked, index);
    const isProperty = masked[before] === "." && masked[before - 1] !== ".";
    const isKey =
      (masked[before] === "{" || masked[before] === ",") &&
      masked[solidFrom(masked, index + word.length)] === ":";
    if (!isProperty && !isKey) {
      names.add(word);
    }
  }
  return names;
};

/** The elements of an object pattern, split on the commas between them. */
const patternElements = (pattern: MaskedCode): string[] => {
  const elements: string[] = [];
  let depth = 0;
  let start = 1;
  for (let index = 1; index < pattern.masked.length - 1; index += 1) {
    const char = pattern.masked[index]!;
    if (char in OPENERS) {
      depth += 1;
    } else if (CLOSERS.has(char)) {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      elements.push(pattern.text.slice(start, index));
      start = index + 1;
    }
  }
  elements.push(pattern.text.slice(start, pattern.text.length - 1));
  return elements
    .map((element) => element.trim())
    .filter((element) => element !== "");
};

/** The local a pattern element binds, or null for a nested pattern. */
const boundName = (element: string): string | null => {
  const colon = element.indexOf(":");
  const afterKey = colon === -1 ? element : element.slice(colon + 1);
  const equals = afterKey.indexOf("=");
  const name = (equals === -1 ? afterKey : afterKey.slice(0, equals))
    .trim()
    .replace(/^\.\.\./, "");
  return IDENTIFIER.test(name) ? name : null;
};

/**
 * The object pattern without the names the callback never reads, so the
 * binding does not introduce unused locals; null when nothing is read.
 */
const readPattern = (
  pattern: MaskedCode,
  bodyMasked: string,
): string | null => {
  const elements = patternElements(pattern);
  const referenced = referencedNames(bodyMasked);
  const read = elements.filter((element) => {
    const name = boundName(element);
    return name === null || referenced.has(name);
  });
  if (read.length === elements.length) {
    return pattern.text;
  }
  return read.length === 0 ? null : `{ ${read.join(", ")} }`;
};

const DECLARATION = /(?<![\w$.])(?:const|let|var)\s/g;

/**
 * Every identifier in the heads of the block's `const`, `let` and `var`
 * declarations: the text between the keyword and its `=`. Covers the names
 * a destructuring pattern binds, and over-counts the names its defaults
 * read.
 */
const declaredNames = (masked: string): string[] =>
  [...masked.matchAll(DECLARATION)].flatMap((declaration) => {
    const start = declaration.index + declaration[0].length;
    let depth = 0;
    let end = start;
    for (; end < masked.length; end += 1) {
      const char = masked[end]!;
      if (char in OPENERS) {
        depth += 1;
      } else if (CLOSERS.has(char)) {
        depth -= 1;
      } else if (depth === 0 && (char === "=" || char === ";")) {
        break;
      }
    }
    return masked.slice(start, end).match(WORD) ?? [];
  });

/** The names an object pattern binds; every word of a nested pattern. */
const patternNames = (pattern: MaskedCode): string[] =>
  patternElements(pattern).flatMap((element) => {
    const name = boundName(element);
    return name === null ? (element.match(WORD) ?? []) : [name];
  });

/** The names the callback binds: its token parameter and its own locals. */
const callbackNames = ({ parameter, body }: Callback): string[] => [
  ...(parameter === null
    ? []
    : parameter.kind === "name"
      ? [parameter.name]
      : patternNames(parameter.pattern)),
  ...(body.kind === "block" ? declaredNames(body.masked) : []),
];

/** Whether the callback's parameter is the ambient `token` name itself. */
const takesTokenByName = ({ parameter }: Callback): boolean =>
  parameter?.kind === "name" && parameter.name === TOKEN;

/**
 * The statement binding the ambient `token` the way the callback's
 * parameter did, leaving out what the callback never reads; none when the
 * parameter is already called `token`.
 */
const tokenBindings = (callback: Callback): string[] => {
  const { parameter, body } = callback;
  if (parameter === null || takesTokenByName(callback)) {
    return [];
  }
  if (parameter.kind === "name") {
    return referencedNames(body.masked).has(parameter.name)
      ? [`const ${parameter.name} = ${TOKEN};`]
      : [];
  }
  const pattern = readPattern(parameter.pattern, body.masked);
  return pattern === null ? [] : [`const ${pattern} = ${TOKEN};`];
};

const RETURN_MAP = /\breturn\s+tokens\s*\.\s*map\s*\(/g;

/**
 * Rewrites an equation body written for the whole place, which ends in
 * `return tokens.map(callback)` over every token, into the one-token body an
 * arity-1 equation runs: the callback's own body over the ambient `token`,
 * bound to the callback's parameter where the two differ, after any
 * statements that came before the return. Comments and the module form
 * `export default Dynamics((tokens, parameters) => ...)` are carried over;
 * fields the callback destructured but never read are left out of the
 * binding.
 *
 * Returns null when the code is not that form, or when the rewrite would
 * change its meaning: a callback that reads the index, another read of
 * `tokens`, a `return` before the map, a second argument to `map`, a
 * callback local that shares its name with one used before the return, or
 * a local of its own called `token`. Such code keeps its text and the
 * editor's diagnostics ask for the one-token form.
 */
export const migrateWholePlaceDynamicsCode = (code: string): string | null => {
  const unwrapped = asBareBody({ text: code, masked: maskLiterals(code) });
  if (unwrapped === null || countWord(unwrapped.body.masked, TOKENS) !== 1) {
    return null;
  }
  const { body } = unwrapped;
  const matches = [...body.masked.matchAll(RETURN_MAP)];
  const match = matches[matches.length - 1];
  if (match === undefined) {
    return null;
  }
  const prefix = slice(body, 0, match.index);
  if (countWord(prefix.masked, "return") > 0) {
    return null;
  }
  const callOpen = match.index + match[0].length - 1;
  const callClose = matchClose(body.masked, callOpen);
  if (callClose === null || !endsStatement(body.masked.slice(callClose + 1))) {
    return null;
  }
  const callback = parseCallback(slice(body, callOpen + 1, callClose));
  if (callback === null) {
    return null;
  }
  // Lifted beside the statements before the return, a name the callback
  // binds would be declared twice in one scope.
  const usedBefore = referencedNames(prefix.masked);
  const bound = callbackNames(callback);
  if (bound.some((name) => usedBefore.has(name))) {
    return null;
  }
  // The body reads the ambient `token`, so the code cannot keep a local of
  // that name unless it is the callback's parameter itself.
  if (
    !takesTokenByName(callback) &&
    (usedBefore.has(TOKEN) ||
      bound.includes(TOKEN) ||
      referencedNames(callback.body.masked).has(TOKEN))
  ) {
    return null;
  }

  const tail = body.text
    .slice(callClose + 1)
    .replace(/^\s*;/, "")
    .trim();
  const callbackBody =
    callback.body.kind === "block"
      ? dedent(callback.body.text).trim()
      : `return ${dedent(callback.body.text)};`;
  return [
    unwrapped.leading.trim(),
    dedent(prefix.text).trim(),
    ...tokenBindings(callback),
    callbackBody,
    tail,
  ]
    .filter((part) => part !== "")
    .join("\n");
};
