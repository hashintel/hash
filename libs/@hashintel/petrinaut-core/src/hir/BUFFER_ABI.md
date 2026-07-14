# HIR buffer ABI

This is the contract between `emit-buffer-js.ts`, `instantiate.ts` and the
simulation engine. Keep this file current when changing packed token layout or
artifact metadata.

## Shared token views

All emitted programs read token bytes through aligned views over the same token
region:

- `f64: Float64Array`
- `u64: BigUint64Array`
- `u8: Uint8Array`

Color elements are packed by `engine/token-layout.ts`.

| Element type | Storage                               |
| ------------ | ------------------------------------- |
| `real`       | one f64 lane                          |
| `integer`    | one f64 lane, rounded by value codecs |
| `boolean`    | one u8 byte, `0` or `1`               |
| `string`     | one u64 string-pool id                |
| `uuid`       | two u64 lanes, low then high          |

Token strides are 8-byte aligned.

## Transition inputs

The emitter and engine use the same input slot order:

1. colored input arcs only;
2. inhibitor arcs excluded;
3. arcs in declaration order;
4. one slot per selected token, repeated by arc weight.

Runtime arguments:

```ts
placeBases: Int32Array; // one byte offset per colored input arc
indices: Int32Array; // one selected token index per input token slot
```

An attribute read compiles to:

```text
base = placeBases[arc] + indices[slot] * strideBytes
read view at base + fieldByteOffset
```

Dynamic indexes into transition input tokens are rejected. Static `.map(...)`
over transition token tuples is unrolled.

## Transition outputs

Kernel staging is a reusable `Uint8Array`.

Order:

1. colored output arcs in declaration order;
2. each arc's tokens in token order;
3. each token uses the output color's packed stride.

Kernel signature:

```ts
(
  f64, u64, u8,
  placeBases, indices,
  outF64, outU64, outU8,
  sink,
) => void
```

Scalar values are written inline. Values that consume engine state are deferred:

```ts
sink("dist", u64OrF64Index, distribution);
sink("generate", u64Index, undefined);
sink("from", u64Index, value);
```

The sink is called in output arc, token and element declaration order so the
engine preserves deterministic RNG behavior.

## Dynamics

Dynamics run per colored place:

```ts
(placeBytes: Uint8Array, numberOfTokens: number) => Float64Array;
```

The result is flat derivatives for real-valued fields only:

```text
numberOfTokens * realFieldCount
```

The field order matches `TokenSlotLayout.realFieldF64Offsets`.

## Metrics

Metrics read a frame's raw token region and dense place metadata:

```ts
(f64, u64, u8, placeCounts, placeOffsets) => number;
```

`HirMetricArtifact.placeNames` records places in first-reference order. At
instantiation, `__places[ordinal]` maps those names to frame place indexes.

Metric token counts are dynamic, so metric `.reduce(...)` and `.concat(...)`
compile to loops over `placeCounts` and `placeOffsets`.

## Artifact validation

Artifacts are `version: 4` and carry a fingerprint of the sanitized SDCPN and
extension settings used for compilation.

The engine rejects stale artifacts by checking:

- artifact version and compilation-input fingerprint;
- lambda `inputSlotCount`;
- kernel `inputSlotCount`;
- kernel `outputByteCount`;
- metric `placeNames` resolution.

There is no runtime object fallback for missing or unsupported artifacts.
