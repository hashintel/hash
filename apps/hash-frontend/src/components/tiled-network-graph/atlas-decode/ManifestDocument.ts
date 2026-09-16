import * as z from "zod";

import * as GenerationId from "./GenerationId";
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

/** A manifest rejected by its JSON schema. */
export class ManifestError extends TaggedError.TaggedError<
  "ManifestError",
  { readonly _tag: "schema" }
> {
  private constructor(cause: z.ZodError) {
    super("ManifestError", { _tag: "schema" }, "invalid manifest", { cause });
  }

  static schema(cause: z.ZodError): ManifestError {
    return new ManifestError(cause);
  }
}

const count = z.int().nonnegative();
const limit = z.uint32();
const zoom = z.int().min(0).max(32);
const cut = z
  .string()
  .regex(
    /^z\+(?:[0-9]|[1-5][0-9]|6[0-3])(?![\s\S])/u,
    "expected a cut from z+0 through z+63",
  );
const span = z
  .number()
  .min(1)
  .max(2 ** 63)
  .refine(
    (value) => 2 ** Math.round(Math.log2(value)) === value,
    "expected a power-of-two span",
  );

const schema = z.object({
  generation: GenerationId.Schema,
  wireVersion: z.int().min(0).max(0xffff),
  variants: z.array(z.string().min(1)),
  bucketSchedule: z.object({ span, cut, maxZoom: zoom }),
  scopeSchedule: z.object({ k: zoom, cut, maxZoom: zoom }),
  limits: z.object({
    tile: z.object({ coloredTypeIds: limit }),
    edges: z.object({ tiles: limit, edges: limit }),
    locate: z.object({
      coloredTypeIds: limit,
      edges: limit,
      properties: limit,
      linkTypeIds: limit,
      linkProperties: limit,
    }),
    translate: z.object({ entityIds: limit }),
    authorityRefreshSeconds: count,
    authorityHardSeconds: count,
  }),
  createdAt: z.iso.datetime({ offset: true }).optional(),
});

type ReadonlyJson<T> = T extends GenerationId.GenerationId
  ? T
  : T extends object
    ? { readonly [Key in keyof T]: ReadonlyJson<T[Key]> }
    : T;

/** Bootstrap metadata. Authority tokens belong to response headers. */
export type Manifest = ReadonlyJson<z.output<typeof schema>>;

/** Decodes parsed JSON, preserving complete Zod errors. Output is readonly without runtime freezing. */
export const decode = (
  input: unknown,
): Result.Result<Manifest, ManifestError> => {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? Result.ok(parsed.data)
    : Result.err(ManifestError.schema(parsed.error));
};
