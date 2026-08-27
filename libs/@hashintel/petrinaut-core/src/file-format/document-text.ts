import { CORE_SCHEMA, dump, load } from "js-yaml";

/** Textual encodings a Petrinaut document can be written in. */
export type DocumentFormat = "yaml" | "json";

export type ParseDocumentTextResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Decodes Petrinaut document text into plain data, accepting YAML and JSON
 * interchangeably. The format is detected from the content, never from a file
 * name. JSON is tried first so existing JSON documents keep their exact
 * `JSON.parse` semantics; everything else goes through the YAML parser, with
 * the YAML core schema so that YAML 1.1 scalars like `on`/`yes` stay strings
 * and timestamps are not coerced to `Date`s.
 */
export const parseDocumentText = (text: string): ParseDocumentTextResult => {
  let jsonError: unknown;
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (error) {
    jsonError = error;
  }

  let data: unknown;
  try {
    data = load(text, { schema: CORE_SCHEMA });
  } catch (yamlError) {
    // A document opening with a brace or bracket was meant as JSON (or YAML
    // flow syntax, which the YAML parse above already covered), so the JSON
    // error is the useful one to surface.
    const startsAsJson = /^[{[]/.test(text.trimStart());
    return {
      ok: false,
      error: startsAsJson
        ? `Not valid JSON: ${errorMessage(jsonError)}`
        : `Not valid YAML: ${errorMessage(yamlError)}`,
    };
  }

  // YAML parses whitespace / comment-only input to null or undefined; surface
  // that as an error rather than letting schema validation report a confusing
  // shape.
  return data === undefined || data === null
    ? { ok: false, error: "The document is empty" }
    : { ok: true, data };
};

/**
 * Encodes a Petrinaut document as text in the given format. YAML output
 * favours hand-readability: multi-line strings (code fields) become literal
 * block scalars, long lines are never folded, and repeated objects are
 * written in full rather than as anchor/alias references. `undefined` values
 * are dropped, matching `JSON.stringify`.
 */
export const serializeDocument = (
  value: unknown,
  format: DocumentFormat,
): string =>
  format === "json"
    ? JSON.stringify(value, null, 2)
    : dump(value, {
        schema: CORE_SCHEMA,
        lineWidth: -1,
        noRefs: true,
        skipInvalid: true,
      });
