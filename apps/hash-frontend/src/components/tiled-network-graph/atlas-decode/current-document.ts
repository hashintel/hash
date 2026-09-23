import * as z from "zod";

import * as GenerationId from "./generation-id";
import * as Result from "./result";
import * as TaggedError from "./tagged-error";

/** A current response rejected by its JSON schema. */
export class CurrentDocumentError extends TaggedError.TaggedError<
  "CurrentDocumentError",
  { readonly _tag: "schema" }
> {
  private constructor(cause: z.ZodError) {
    super(
      "CurrentDocumentError",
      { _tag: "schema" },
      "invalid current response",
      { cause },
    );
  }

  static schema(cause: z.ZodError): CurrentDocumentError {
    return new CurrentDocumentError(cause);
  }
}

const schema = z.object({ generation: GenerationId.Schema });

/** The active generation named by the current response. */
export type CurrentDocument = Readonly<z.output<typeof schema>>;

/** Decodes parsed JSON, ignoring unknown keys. Schema errors retain all Zod issues. */
export const decode = (
  input: unknown,
): Result.Result<CurrentDocument, CurrentDocumentError> => {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? Result.ok(parsed.data)
    : Result.err(CurrentDocumentError.schema(parsed.error));
};
