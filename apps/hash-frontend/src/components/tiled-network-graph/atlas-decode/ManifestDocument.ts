import * as z from "zod";

import * as GenerationId from "./GenerationId";
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

const count = z.int().nonnegative();
const schema = z.object({
  generation: z.hex().length(64),
  wireVersion: count,
  variants: z.array(z.string()),
  bucketSchedule: z.object({ span: count, cut: z.string(), maxZoom: count }),
  scopeSchedule: z.object({ k: count, cut: z.string(), maxZoom: count }),
  limits: z.object({
    tile: z.object({ coloredTypeIds: count }),
    edges: z.object({ tiles: count, edges: count }),
    locate: z.object({
      coloredTypeIds: count,
      edges: count,
      properties: count,
      linkTypeIds: count,
      linkProperties: count,
    }),
    translate: z.object({ entityIds: count }),
    authorityRefreshSeconds: count,
    authorityHardSeconds: count,
  }),
  createdAt: z.string().optional(),
});

type ReadonlyJson<T> = T extends object
  ? { readonly [Key in keyof T]: ReadonlyJson<T[Key]> }
  : T;

/** Bootstrap metadata. Authority tokens belong to response headers. */
export type Manifest = ReadonlyJson<
  Omit<z.output<typeof schema>, "generation">
> & {
  readonly generation: GenerationId.GenerationId;
};

/** A manifest rejected by its JSON schema or generation parser. */
export class ManifestError extends TaggedError.TaggedError<
  "ManifestError",
  { readonly _tag: "schema" | "generation" }
> {
  private constructor(section: "schema" | "generation", cause: unknown) {
    super("ManifestError", { _tag: section }, `invalid manifest ${section}`, {
      cause,
    });
  }

  static schema(cause: z.ZodError): ManifestError {
    return new ManifestError("schema", cause);
  }

  static generation(
    this: void,
    cause: GenerationId.GenerationIdError,
  ): ManifestError {
    return new ManifestError("generation", cause);
  }
}

/** Decodes parsed JSON, preserving complete Zod errors. Output is readonly without runtime freezing. */
export const decode = Result.fn(function* decode(
  input: unknown,
): Result.gen.Return<Manifest, ManifestError> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return yield* Result.err(ManifestError.schema(parsed.error));
  }
  const generation = yield* GenerationId.fromHex(parsed.data.generation).pipe(
    Result.changeContext(ManifestError.generation),
  );
  return { ...parsed.data, generation };
});
