/**
 * The code a DSL block holds: the bare function body form, which is what the
 * docs teach and what fits between a keyword's braces. Code written in the
 * older module form, `export default Ctor((input, parameters) => …)`, is
 * unwrapped when its parameters are the ambient names, and printed as it is
 * otherwise, so nothing is renamed behind the author's back.
 */

import type { DslCodeKeyword } from "./keywords";

/** The names a bare body reads its inputs from, per surface. */
const ambientNames: Partial<Record<DslCodeKeyword, readonly string[]>> = {
  dynamics: ["tokens", "parameters"],
  rate: ["input", "parameters"],
  guard: ["input", "parameters"],
  kernel: ["input", "parameters"],
};

const moduleHeadPattern =
  /export\s+default\s+[A-Za-z_$][\w$]*\s*\(\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*/u;

/** The index just past the bracket that closes the one at `openIndex`. */
const closingIndex = (
  text: string,
  openIndex: number,
  open: string,
  close: string,
): number | null => {
  let depth = 0;
  let quote: string | null = null;
  for (let index = openIndex; index < text.length; index++) {
    const char = text[index]!;
    if (quote !== null) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return null;
};

const referencesIdentifier = (code: string, name: string): boolean =>
  new RegExp(`(?<![\\w$.])${name}(?![\\w$])`, "u").test(code);

/** Lines with their common leading indentation removed and blank edges trimmed. */
export const dedentLines = (code: string): string[] => {
  const lines = code.replace(/\r\n?/gu, "\n").split("\n");
  while (lines.length > 0 && lines[0]!.trim() === "") {
    lines.shift();
  }
  while (lines.length > 0 && lines.at(-1)!.trim() === "") {
    lines.pop();
  }
  const indents = lines
    .filter((line) => line.trim() !== "")
    .map((line) => /^\s*/u.exec(line)![0].length);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(Math.min(common, line.length)));
};

/**
 * The function body `code` holds, for a block under `keyword`: `code` itself
 * when it is a bare body, the arrow function's body when it is a module
 * whose parameters are the surface's ambient names, and the module as it is
 * otherwise.
 */
export const toBodyForm = (code: string, keyword: DslCodeKeyword): string => {
  const ambient = ambientNames[keyword];
  const head = moduleHeadPattern.exec(code);
  if (ambient === undefined || head === null) {
    return code;
  }
  const leading = code.slice(0, head.index);
  const parameters = head[1]!
    .split(",")
    .map((parameter) => parameter.trim().split(/[\s:=]/u)[0] ?? "")
    .filter((name) => name !== "");
  const bodyStart = head.index + head[0].length;
  const rest = code.slice(bodyStart);

  let body: string;
  if (rest.startsWith("{")) {
    const end = closingIndex(rest, 0, "{", "}");
    if (end === null) {
      return code;
    }
    body = rest.slice(1, end - 1);
  } else {
    // An expression body runs to the bracket that closes the constructor call.
    const callOpen = code.lastIndexOf("(", bodyStart - 1);
    const headCallOpen = code.indexOf("(", head.index);
    const end = closingIndex(code, headCallOpen, "(", ")");
    if (end === null || callOpen < 0) {
      return code;
    }
    const expression = code.slice(bodyStart, end - 1).trim();
    body = `return ${expression};`;
  }

  // A parameter named differently from its ambient name would have to be
  // renamed wherever the body reads it; the module stays a module instead.
  const renamed = parameters.some(
    (name, index) =>
      name !== ambient[index] && referencesIdentifier(body, name),
  );
  if (renamed) {
    return code;
  }
  const leadingLines = dedentLines(leading);
  const bodyLines = dedentLines(body);
  return [...leadingLines, ...bodyLines].join("\n");
};
