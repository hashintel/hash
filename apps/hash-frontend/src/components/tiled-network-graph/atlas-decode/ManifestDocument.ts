import * as z from "zod";

import { SALTILE_WIRE_VERSION } from "./Envelope";
import * as GenerationId from "./GenerationId";
import * as Result from "./Result";
import * as TaggedError from "./TaggedError";

export type ManifestErrorReason =
  | { readonly _tag: "schema" }
  | {
      readonly _tag: "generation-mismatch";
      readonly expected: GenerationId.GenerationId;
      readonly actual: GenerationId.GenerationId;
    };

/** A manifest rejected by its JSON schema or requested generation. */
export class ManifestError extends TaggedError.TaggedError<
  "ManifestError",
  ManifestErrorReason
> {
  private constructor(reason: ManifestErrorReason, options?: ErrorOptions) {
    const message =
      reason._tag === "schema"
        ? "invalid manifest"
        : `expected generation ${reason.expected}, received ${reason.actual}`;
    super("ManifestError", reason, message, options);
  }

  static schema(cause: z.ZodError): ManifestError {
    return new ManifestError({ _tag: "schema" }, { cause });
  }

  static generationMismatch(
    expected: GenerationId.GenerationId,
    actual: GenerationId.GenerationId,
  ): ManifestError {
    return new ManifestError({ _tag: "generation-mismatch", expected, actual });
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

const variant = z.string().min(1);

const schema = z.object({
  generation: GenerationId.Schema,
  wireVersion: z.literal(SALTILE_WIRE_VERSION),
  variants: z.tuple([variant]).rest(variant),
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

export interface DecodeOptions {
  readonly generation: GenerationId.GenerationId;
}

/** Decodes a supported manifest against the requested generation. */
export const decode = (
  input: unknown,
  { generation }: DecodeOptions,
): Result.Result<Manifest, ManifestError> => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return Result.err(ManifestError.schema(parsed.error));
  }

  return Result.filter(
    Result.ok(parsed.data),
    (document) => document.generation.equals(generation),
    (document) =>
      ManifestError.generationMismatch(generation, document.generation),
  );
};
