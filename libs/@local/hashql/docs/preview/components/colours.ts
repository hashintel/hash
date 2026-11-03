import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";

/** The themes fumadocs highlights code blocks with by default. */
export const themes = { light: "github-light", dark: "github-dark" } as const;

/** The TextMate scope a theme colours each kind of name by. */
const scopes: Readonly<Record<string, string>> = {
  function: "entity.name.function",
  method: "entity.name.function",
  interface: "entity.name.type.interface",
  trait: "entity.name.type.interface",
  type: "entity.name.type.alias",
  enum: "entity.name.type.enum",
  class: "entity.name.type.class",
  const: "variable.other.constant",
  property: "variable.other.property",
  accessor: "variable.other.property",
  namespace: "entity.name.type.module",
  module: "entity.name.type.module",
};

type Theme = typeof githubLight;

/** The selectors a theme's rule applies to. */
const selectorsOf = ({
  scope,
}: NonNullable<Theme["tokenColors"]>[number]): readonly string[] => {
  if (typeof scope === "string") {
    return scope.split(",").map((selector) => selector.trim());
  }

  return scope ?? [];
};

/** The colour `theme` gives `scope`: the foreground of its most specific rule that names the scope or a prefix of it. */
const colourOf = (theme: Theme, scope: string): string | undefined => {
  let best: { readonly colour: string | undefined; readonly length: number } = {
    colour: undefined,
    length: -1,
  };
  for (const rule of theme.tokenColors ?? []) {
    const { foreground } = rule.settings;
    for (const selector of selectorsOf(rule)) {
      const matches = scope === selector || scope.startsWith(`${selector}.`);
      if (
        matches &&
        !selector.includes(" ") &&
        selector.length > best.length &&
        foreground !== undefined
      ) {
        best = { colour: foreground, length: selector.length };
      }
    }
  }

  return best.colour;
};

/** The custom properties that colour a name of `kind` as the themes colour that kind of name in code, `--api-link-light` and `--api-link-dark`, or none for a kind they do not colour. */
export const coloursOf = (
  kind: string | undefined,
): Readonly<Record<string, string>> | undefined => {
  const scope = kind === undefined ? undefined : scopes[kind];
  if (scope === undefined) {
    return undefined;
  }

  const light = colourOf(githubLight, scope);
  const dark = colourOf(githubDark, scope);
  if (light === undefined || dark === undefined) {
    return undefined;
  }

  return { "--api-link-light": light, "--api-link-dark": dark };
};
