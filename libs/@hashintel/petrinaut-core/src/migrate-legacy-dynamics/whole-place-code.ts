/**
 * The ambient name of a dynamics body's input, as `AMBIENT_INPUT_NAMES` in
 * `hir/user-code-form.ts` declares it. Spelled out here because this module
 * runs in the editor's main bundle, which must not reach the TypeScript
 * compiler that module imports; the rewrite scans the text instead.
 */
const TOKENS = "tokens";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const WORD = /\b[A-Za-z_$][\w$]*\b/g;
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

const countWord = (masked: string, word: string): number =>
  (masked.match(new RegExp(`\\b${word}\\b`, "g")) ?? []).length;

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
type Body = { text: string; masked: string };

const slice = (body: Body, from: number, to: number): Body => ({
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
const asBareBody = (body: Body): { leading: string; body: Body } | null => {
  const header = MODULE_HEADER.exec(body.masked);
  if (header === null) {
    return /\bexport\b/.test(body.masked) ? null : { leading: "", body };
  }
  const exportAt = header[0].indexOf("export");
  const leading = body.text.slice(0, exportAt);
  const callOpen = body.masked.indexOf("(", header[0].indexOf("Dynamics"));
  const callClose = matchClose(body.masked, callOpen);
  const bodyStart = header[0].length;
  if (
    callClose === null ||
    !/^\s*;?\s*$/.test(body.masked.slice(callClose + 1))
  ) {
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
    | { kind: "pattern"; pattern: Body }
    | null;
  /** The callback's own statements, or the expression it returns. */
  body: { kind: "block" | "expression"; text: string; masked: string };
};

const ARROW = /^\s*(?:\(([\s\S]*?)\)|([A-Za-z_$][\w$]*))\s*=>\s*/;

/** The arrow function `tokens.map` is called with, or null when it is not one. */
const parseCallback = (args: Body): Callback | null => {
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

const escapeRegExp = (text: string): string =>
  text.replace(/[$^.*+?()[\]{}|\\]/g, "\\$&");

/**
 * Whether the callback body reads the local `name`: an occurrence that is
 * neither a property access nor the key of an object literal entry.
 */
const isReferenced = (bodyMasked: string, name: string): boolean => {
  const word = escapeRegExp(name);
  const occurrences = bodyMasked.match(
    new RegExp(`(?<![.\\w$])${word}\\b`, "g"),
  );
  const keys = bodyMasked.match(
    new RegExp(`(?<=[{,]\\s*)${word}(?=\\s*:)`, "g"),
  );
  return (occurrences?.length ?? 0) > (keys?.length ?? 0);
};

/** The elements of an object pattern, split on the commas between them. */
const patternElements = (pattern: Body): string[] => {
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
const readPattern = (pattern: Body, bodyMasked: string): string | null => {
  const elements = patternElements(pattern);
  const read = elements.filter((element) => {
    const name = boundName(element);
    return name === null || isReferenced(bodyMasked, name);
  });
  if (read.length === elements.length) {
    return pattern.text;
  }
  return read.length === 0 ? null : `{ ${read.join(", ")} }`;
};

/** A local name for the one token that the code does not use yet. */
const freshTokenName = (masked: string): string => {
  const taken = new Set(masked.match(WORD) ?? []);
  let name = "token";
  while (taken.has(name)) {
    name = `${name}_`;
  }
  return name;
};

/**
 * The statements binding the one token the way the callback's parameter
 * did, leaving out what the callback never reads.
 */
const tokenBindings = (callback: Callback, masked: string): string[] => {
  const { parameter, body } = callback;
  if (parameter === null) {
    return [];
  }
  if (parameter.kind === "name") {
    return isReferenced(body.masked, parameter.name)
      ? [`const [${parameter.name}] = ${TOKENS};`]
      : [];
  }
  const pattern = readPattern(parameter.pattern, body.masked);
  if (pattern === null) {
    return [];
  }
  const token = freshTokenName(masked);
  return [`const [${token}] = ${TOKENS};`, `const ${pattern} = ${token};`];
};

const RETURN_MAP = /\breturn\s+tokens\s*\.\s*map\s*\(/g;

/**
 * Rewrites an equation body written for the whole place, which ends in
 * `return tokens.map(callback)` over every token, into the one-token body an
 * arity-1 equation runs: `const [token] = tokens;` followed by the callback's
 * own body, after any statements that came before the return. Comments and
 * the module form `export default Dynamics((tokens, parameters) => ...)`
 * are carried over; fields the callback destructured but never read are
 * left out of the binding.
 *
 * Returns null when the code is not that form, or when the rewrite would
 * change its meaning: a callback that reads the index, another read of
 * `tokens`, a `return` before the map, or a second argument to `map`. Such
 * code keeps its text and the editor's diagnostics ask for the one-token
 * form.
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
  if (
    callClose === null ||
    !/^\s*;?\s*$/.test(body.masked.slice(callClose + 1))
  ) {
    return null;
  }
  const callback = parseCallback(slice(body, callOpen + 1, callClose));
  if (callback === null) {
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
    ...tokenBindings(callback, body.masked),
    callbackBody,
    tail,
  ]
    .filter((part) => part !== "")
    .join("\n");
};
