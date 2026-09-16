import * as z from "zod";

import * as GenerationId from "./GenerationId";
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

const schema = z.object({ generation: z.hex().length(64) });

/** The active generation named by the current response. */
export type CurrentDocument = Readonly<
  Omit<z.output<typeof schema>, "generation"> & {
    generation: GenerationId.GenerationId;
  }
>;

/** A current response rejected by its JSON schema or generation parser. */
export class CurrentDocumentError extends TaggedError.TaggedError<
  "CurrentDocumentError",
  { readonly _tag: "schema" | "generation" }
> {
  private constructor(section: "schema" | "generation", cause: unknown) {
    super(
      "CurrentDocumentError",
      { _tag: section },
      `invalid current ${section}`,
      { cause },
    );
  }

  static schema(cause: z.ZodError): CurrentDocumentError {
    return new CurrentDocumentError("schema", cause);
  }

  static generation(
    this: void,
    cause: GenerationId.GenerationIdError,
  ): CurrentDocumentError {
    return new CurrentDocumentError("generation", cause);
  }
}

/** Decodes parsed JSON, ignoring unknown keys. Schema errors retain all Zod issues. */
export const decode = Result.fn(function* decode(
  input: unknown,
): Result.gen.Return<CurrentDocument, CurrentDocumentError> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return yield* Result.err(CurrentDocumentError.schema(parsed.error));
  }

  const generation = yield* GenerationId.fromHex(parsed.data.generation).pipe(
    Result.changeContext(CurrentDocumentError.generation),
  );

  return { generation };
});
