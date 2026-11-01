/**
 * How names appear in the DSL: bare when they are identifiers, quoted
 * otherwise. Places, transitions and instances always have identifier names;
 * types, equations, components, parameters' labels, metrics, scenarios and
 * fusions may not.
 */

const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;

export const isDslIdentifier = (name: string): boolean =>
  identifierPattern.test(name);

/** `name` bare when it is an identifier, else as a JSON string. */
export const dslName = (name: string): string =>
  isDslIdentifier(name) ? name : JSON.stringify(name);

/** `name` lowercased with everything but letters and digits removed, to compare spellings. */
export const plainWords = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/gu, "");
