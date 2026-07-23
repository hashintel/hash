# Atlas wire format

The binary contract for every atlas geometry response: tile, edges, and locate. This document is exported verbatim into the OpenAPI description the server publishes; it is the normative text a decoder implements against.

## 1. Scope

One envelope family carries every binary response. The manifest stays JSON: read once per session, human-debuggable, and it carries the `wireVersion` pin that governs everything else. Transport compression is HTTP `Content-Encoding`; the envelope is compression-agnostic.

## 2. Envelope

Responses carry `application/vnd.hash.saltile-v1`; the media-type version and the prefix `wireVersion` must agree. All integers are little-endian. One response = prefix, directory, payloads, optional trailer:

| Region    | Size            | Contents                                                                                                                 |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| prefix    | 16 B            | magic u64 (`"SALTILE"` + kind), `wireVersion` u16 = 1, `flags` u16 = 0, `slotCount` u16, `reserved` u16 = 0              |
| directory | 8 B x slotCount | per slot: `start` u32, `end` u32 - absolute byte offsets, `end` exclusive and unpadded; `(0, 0)` marks an absent section |
| payloads  | per directory   | sequential in slot order, each zero-padded to 8                                                                          |
| trailer   | self-delimiting | optional CBOR tail: declared by HEAD (tile, edges) or mandated by kind (locate)                                          |

The prefix, bit by bit:

```mermaid
packet-beta
title Envelope prefix (16 bytes)
0-55: "magic: 'SALTILE' (seven ASCII bytes)"
56-63: "kind: 'T' | 'E' | 'L'"
64-79: "wireVersion = 1 (u16 LE)"
80-95: "flags = 0"
96-111: "slotCount (u16 LE)"
112-127: "reserved = 0"
```

One directory entry per slot:

```mermaid
packet-beta
title Directory entry (8 bytes per slot)
0-31: "start (u32 LE, absolute byte offset, 8-aligned)"
32-63: "end (u32 LE, exclusive, unpadded)"
```

The offset directory is the locating mechanism: a fixed lookup, no linear scan and no parse to find a section. Slot meanings are frozen per (kind, wireVersion) - section 3 carries the tables - and evolution appends slots: a decoder reads the slots it supports and ignores the rest, both trailing slots it has no table entry for and populated slots it chooses not to consume. Nothing forces a decoder to touch any payload but the ones it renders: a renderer can view `POSITIONS` straight out of the buffer before parsing a byte of CBOR.

- Alignment by construction: the payload region starts at `16 + 8 x slotCount` (8-aligned), every `start` is 8-aligned, and `end` pads to the next 8 boundary with zero bytes (at most 7). JS typed-array views throw on misaligned offsets; alignment is a wire contract.
- The magic's eighth byte is the response kind, ASCII initials: `T` tile, `E` edges, `L` locate (`SALTILET`, `SALTILEE`, `SALTILEL`). The seven-byte family prefix is constant; the decoder selects the expected HEAD schema and slot table by kind and rejects a kind that does not match the request. One `wireVersion` governs the whole family: kind discriminates grammar variant, version tracks evolution.
- Directory rules: slot 0 (HEAD) is always present; present slots are strictly sequential (`start_next = align8(end_prev)`, the first present start = `16 + 8 x slotCount`); `end >= start`; `slotCount` at least the kind's table size. Present-but-empty (`start == end`, nonzero) is distinct from absent (`0, 0`): a zero-point tile carries present-empty columns, a request without `coloredTypeIds` gets an absent `TYPE_MASK`.
- Offsets are u32: responses are bounded below 4 GiB by construction (the published caps keep real responses in the KB-MB range; a response that could exceed u32 is a `wireVersion` bump).
- Prefix `flags` and `reserved` must be zero.
- Payload order equals slot order, and prefix, directory, HEAD, and columns are pure functions of `(generation, request, visibility)` - identical requests under identical visibility yield byte-identical bytes there, the property the client's application-layer cache keys on. The DETAIL TRAILER is the one deliberate exception: it hydrates from the live store at request time (labels, icons, properties edited after publish show on snapshot geometry - by design), so trailer bytes may differ between identical requests and a detailed response is not a candidate for byte-keyed caching. Cache the geometry sections; refetch detail.

Streaming contract: every column's extent is known before the first payload byte, so prefix + directory stream first and columns follow immediately; the trailer is the one late-arriving piece (live store hydration), so it lives outside the directory as a self-delimiting CBOR tail - declared by a HEAD key on tile and edges, mandated by kind on locate - whose start is `align8` of the last present column's end and whose extent is its own CBOR structure. The LAYOUT is the streaming contract; current servers assemble the whole body before the first byte, so a detailed response's first-byte latency includes hydration today. A streaming decoder is correct against both: geometry sections decode from a partial body, and on successful responses a future streaming server changes delivery timing, never bytes. If a streaming server's hydration fails after columns are sent, the trailer arrives VALID and EMPTY-SHAPED - the absent-detail vocabulary (null labels, completeness bits unset) - never a truncated body; problem documents cover only failures before the first body byte.

## 3. Slot tables

Sections are named by (kind, slot); the names are labels, the slots are the wire. Frozen per (kind, wireVersion); additions append.

`SALTILET` (tile), slotCount = 5:

| Slot | Section     | Contents                                                                                                                                                                                            |
| ---- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `HEAD`      | CBOR map (deterministic encoding)                                                                                                                                                                   |
| 1    | `POSITIONS` | f32 xy pairs, delivered order (8 B/point)                                                                                                                                                           |
| 2    | `ROW_IDS`   | u32, delivered order (4 B/point)                                                                                                                                                                    |
| 3    | `TYPE_MASK` | per-point bitmasks, delivered order (ceil(n/8) B/point, n = request's coloredTypeIds count)                                                                                                         |
| 4    | `MASS`      | u32, delivered order - RESERVED: a wireVersion-1 server marks it absent `(0, 0)`; a populated `MASS` decodes by this declared type or is ignored, per the section 2 evolution rule - never rejected |

`SALTILEE` (edges), slotCount = 4:

| Slot | Section        | Contents                                                                           |
| ---- | -------------- | ---------------------------------------------------------------------------------- |
| 0    | `HEAD`         | CBOR map                                                                           |
| 1    | `EDGE_SOURCES` | u32 node row ids, delivery order                                                   |
| 2    | `EDGE_TARGETS` | u32 node row ids, delivery order                                                   |
| 3    | `EDGE_IDS`     | raw 32-byte link-entity identity records, delivery order (32 B/edge, no CBOR head) |

`SALTILEL` (locate), slotCount = 7:

| Slot | Section        | Contents                                                                       |
| ---- | -------------- | ------------------------------------------------------------------------------ |
| 0    | `HEAD`         | CBOR map                                                                       |
| 1    | `POSITIONS`    | f32 xy pairs, delivered order                                                  |
| 2    | `ROW_IDS`      | u32 node row ids, delivered order                                              |
| 3    | `TYPE_MASK`    | per-point bitmasks (absent unless the request supplies coloredTypeIds)         |
| 4    | `EDGE_SOURCES` | u32 node row ids, edge order                                                   |
| 5    | `EDGE_TARGETS` | u32 node row ids, edge order                                                   |
| 6    | `EDGE_IDS`     | raw 32-byte link-entity identity records, edge order (32 B/edge, no CBOR head) |

TRAILER (all kinds): CBOR tail outside the directory - declared by the HEAD `trailer` key on tile and edges, always present on locate.

`POSITIONS` interleaves xy within one section (a vec2 vertex attribute, stride 8); SoA applies at attribute granularity, never within one attribute.

`TYPE_MASK` gives point p its bitmask at byte offset `p * ceil(n/8)`: bit i (byte `i >> 3`, bit `i & 7`, LSB-first) = the point carries the request's type i. No-match is the zero mask - no sentinel exists - and multi-typed points carry every matching bit; which color paints, blends, or badges is the client's policy, re-prioritizable without a re-fetch. A mask read as its set-bit indexes is the point's colored-type index list. At n <= 8 the column is one byte per point.

The `coloredTypeIds` entries are user-facing VERSIONED type URLs. The server resolves each against the generation's snapshot with descendant expansion: a point matches type i when it carries the requested type or any descendant of it. An id that resolves to no type in this generation is legal - it never matches, so its bit reads 0 in every point's mask. `TYPE_MASK` rides only requests that supply `coloredTypeIds` - absent otherwise (directory `(0, 0)`).

## 4. CBOR profile

RFC 8949 section 4.2.1 deterministic encoding with genuine restrictions - definite lengths only, integer map keys, no tags, no indefinite items - and ONE deliberate divergence from section 4.2.1's preferred serialization: floats are fixed-width by originating type, never shortened. Geometry and HEAD floats are always IEEE 754 single (they originate as f32, even where a half would preserve the value), property values always double (store scalars are doubles); the width carries the type, and byte shapes stay value-independent. The same profile canonicalizes request bodies for cache keys.

## 5. Identifiers

Two identity domains cross the wire:

- Node row ids (`ROW_IDS`, `EDGE_SOURCES`, `EDGE_TARGETS`, and the locate request's `row`) are OPAQUE SPARSE u32 values: consistent across every endpoint of one generation, issued through a keyed permutation of the full u32 range, never bounded by the generation's row count, and not stable across generations - re-translate after a generation change. Any u32 value is well-formed; values the generation never issued simply resolve to nothing. The permutation's design target is that ids carry no ordering, adjacency, creation-time, or count information; that hiding is the construction's target, not a demonstrated boundary. Treat ids as meaningless handles either way.
- Entity ids (`EDGE_IDS`, the locate HEAD's `entityId`) are 32 raw bytes: the web uuid then the entity uuid, sixteen bytes each, untagged. They are upstream identities - stable across generations - and every delivered edge carries one (identity is generation-frozen, never store hydration).

Edges carry NO wire id of their own: a link entity's id IS its identity in every binary response, and edge delivery order is ascending `EDGE_IDS` bytes - client-verifiable from the column alone.

## 6. Tile response

HEAD keys:

| Key | Name          | Type        | Meaning                                                                                                               |
| --- | ------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| 0   | `generation`  | `bstr(32)`  | sha256 identity, echoes the route                                                                                     |
| 1   | `variant`     | `uint`      | the route's variant as its index in the manifest `variants` list                                                      |
| 2   | `coordinate`  | `[z, x, y]` | uints, echoes the route                                                                                               |
| 3   | `mode`        | `uint`      | 0 = delta, 1 = total                                                                                                  |
| 4   | `delivered`   | `uint`      | point count in this response                                                                                          |
| 5   | `visible`     | `uint`      | visibleSubtreeCount for the extent                                                                                    |
| 6   | `firstBucket` | `uint`      | b0 of the `runs` array                                                                                                |
| 7   | `runs`        | `[uint...]` | per-bucket delivered counts, buckets b0.. (note below)                                                                |
| 8   | `global`      | `map`       | post-intersection set metadata (note below)                                                                           |
| 9   | `children`    | `uint`      | occupied-child bitmask, bit i = Morton child i holds an undelivered visible point below this zoom's cut; 0 = complete |
| 10  | `trailer`     | `bool`      | a CBOR trailer tail follows the last column (echoes includeDetailedData)                                              |
| 11  | `backfilled`  | `uint`      | points pulled up from deeper buckets, trailing the runs' extent; omitted when zero                                    |

`runs`: delta responses carry one entry with b0 = z+m; total responses carry z+m+1 entries with b0 = 0. Zero-length entries keep their positional slot, so bucket = b0 + i always holds. The zoom-0 delta root is the one delta case with m+1 entries (buckets 0..=m, b0 = 0). `runs` is what a progressive renderer paints from (total responses are bucket-major, coarse structure first); bucket b0+i's rows sit at column offset `sum(runs[..i])`.

Restricted views backfill: when authorization or filtering hides part of the schedule, a response fills its shortfall by pulling visible points up from deeper buckets - bucket order, so the pulled structure stays coarse-first - until the schedule's own count is met or the visible subtree is exhausted. The pulled points trail the natural runs in every column: the runs cover the leading `delivered - backfilled` points, the last `backfilled` points are the fill. The fill never repeats a point down the zoom ladder (each response accounts for what every shallower response delivered under the same view), so delta accumulation stays duplicate-free with no client-side bookkeeping, and a total response remains exactly the accumulated view of its extent - which under concentrated pull-ups may exceed the extent's unmasked count. Full-visibility responses carry no fill and omit the key.

`global` sub-keys - REQUIRED on the root tile (z = 0, the bootstrap camera framing datum), permitted on every tile response:

| Key | Name            | Type        | Meaning                                                                         |
| --- | --------------- | ----------- | ------------------------------------------------------------------------------- |
| 0   | `visible`       | `uint`      | visible count at the current zoom                                               |
| 1   | `bounds`        | `[4 x f32]` | tight wire-frame extent of the ENTIRE visible set; absent iff that set is empty |
| 2   | `minResolution` | `uint`      | the coarsest resolution the visible set spans                                   |

- One 32-byte identity echo pins everything: the generation id is sha256 of the generation's metadata document, which carries every artifact digest. The echo exists so a stale or misrouted cache body is rejected before its arrays reach a renderer.
- `complete` does not ride the tile wire: `children == 0` IS the completeness signal, in both modes (nothing deeper exists), and a total-mode client can cross-check it against `delivered == visible`.
- `children` bits beyond the low four are reserved zero. A diving client walks exactly the occupied frontier - no empty-tile probes. A cell with no quad node answers `children = 0` (its points, if any, were all delivered by ancestor cuts). Under an active filter the truthful bitmask is post-intersection, like `visible`.
- No response-level type summary rides the HEAD: "which requested types are active here" is the OR of the `TYPE_MASK` column, derivable in the same decode pass that colors dots.
- Truncation is detectable from the directory alone: the response must extend to `align8(end)` of the last present slot, plus a complete CBOR item when HEAD declares the trailer - a stream ending early is an error even without Content-Length.
- `visible` and every `global` aggregate are post-intersection quantities (authorization and filter).

Tile TRAILER, present iff the request set `includeDetailedData`:

| Key | Name     | Type                 | Meaning         |
| --- | -------- | -------------------- | --------------- |
| 0   | `labels` | `[tstr or null ...]` | delivered order |
| 1   | `icons`  | `[tstr or null ...]` | delivered order |

Parsed, not viewed - one decode pass; label hydration latency never blocks geometry because the trailer is last. Null marks a row whose label did not resolve.

## 7. Edges response

HEAD keys:

| Key | Name         | Type       | Meaning                                                                                                     |
| --- | ------------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| 0   | `generation` | `bstr(32)` | sha256 identity, echoes the route                                                                           |
| 1   | `variant`    | `uint`     | the route's variant as its index in the manifest `variants` list                                            |
| 2   | `count`      | `uint`     | edge count in this response                                                                                 |
| 3   | `complete`   | `bool`     | false = the rank-ordered cap truncated the set (auth-invisible edges are NOT truncation - missing = denied) |
| 4   | `trailer`    | `bool`     | a CBOR trailer tail follows the last column (echoes includeDetailedData)                                    |

The request's `tiles` list is not echoed: it rides the POST body, responses are `private, no-store`, and the generation echo pins identity. Column extents are `4 x count` for the endpoint columns and `32 x count` for `EDGE_IDS`. Delivery order is ascending `EDGE_IDS` bytes, independent of the tiles listed and of truncation, so identical requests yield identical column bytes; a detail trailer reflects live store state at hydration and is exempt from that identity (section 2). Every delivered edge has both endpoints in the listed tiles' delivered row sets; sources and targets reference node row ids the client already holds for those tiles.

Edges TRAILER, present iff `includeDetailedData` (edge order):

| Key | Name          | Type                 | Meaning                                                                                                                   |
| --- | ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 0   | `typeTable`   | `[tstr ...]`         | the type intern table: every referenced versioned type URL once, bytewise-sorted                                          |
| 1   | `linkLabels`  | `[tstr or null ...]` | edge order                                                                                                                |
| 2   | `linkTypeIds` | `[uint or null ...]` | each link's first direct type as a typeTable index; null = the store no longer serves the link or records no types for it |

The bulk surface ships type REFERENCES, never rendered display: the client resolves labels and icons through its own type metadata - one owner per display concern.

## 8. Locate response

HEAD keys:

| Key | Name                 | Type        | Meaning                                                                                                                                                                        |
| --- | -------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | `generation`         | `bstr(32)`  | sha256 identity, echoes the route                                                                                                                                              |
| 1   | `variant`            | `uint`      | the route's variant as its index in the manifest `variants` list                                                                                                               |
| 2   | `count`              | `uint`      | delivered node count (source included)                                                                                                                                         |
| 3   | `zoom`               | `uint`      | the source's first visible zoom                                                                                                                                                |
| 4   | `cell`               | `[z, x, y]` | the source's tile at that zoom - the client's fly-to target                                                                                                                    |
| 5   | `edges`              | `uint`      | delivered edge count                                                                                                                                                           |
| 6   | `complete`           | `bool`      | false = the locate edge cap truncated the subgraph (auth-invisible edges are NOT truncation - missing = denied)                                                                |
| 7   | `entityId`           | `bstr(32)`  | the source's upstream entity id: web uuid then entity uuid - the by-row flow's identity answer                                                                                 |
| 8   | `typeIdsComplete`    | `bool`      | the request's coloredTypeIds cover every direct type of the source; false on an empty request set and for a source the store no longer serves                                  |
| 9   | `propertiesComplete` | `bool`      | the trailer's source property map is the entity's whole set; false when the simple-value filter or the property cap dropped anything, or the store no longer serves the source |

Delivered node order is SOURCE FIRST, then the delivered edges' partners ascending by wire row id. A partner whose every edge truncated is not delivered. The source's row id and position are `ROW_IDS[0]` / `POSITIONS[0]`; no HEAD key repeats them. `zoom` is the zoom at which the source's dot first appears; `cell` is its tile there. Identical requests yield identical prefix, directory, HEAD, and column bytes; the trailer reflects live store state at hydration and is exempt (section 2). The request's `entityId` is not echoed (POST body + `private, no-store` + the generation echo).

Edge columns carry the source's EGO-GRAPH: every edge incident to the source, both directions, a self-loop exactly once, its other endpoint visible - ascending `EDGE_IDS` bytes, capped by `limits.locateEdges`. Truncation keeps the edges whose partners lie nearest the source, ascending (squared wire-frame distance to the partner, partner first-visible zoom, `EDGE_IDS` bytes); the key only selects - presentation stays ascending `EDGE_IDS` bytes - and HEAD reports `complete: false`. `edges: 0` with `complete: true` is the honest answer for an unlinked source: the ego-graph of an isolated dot is the dot.

Locate TRAILER, ALWAYS present - locate is the detail view. The two intern tables first, then node arrays in delivered order and link arrays in edge order, every type and property reference a uint index into its table:

| Key | Name                     | Type                 | Meaning                                                                                                                                                                                                             |
| --- | ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `typeTable`              | `[tstr ...]`         | every referenced versioned type URL once, bytewise-sorted                                                                                                                                                           |
| 1   | `propertyTable`          | `[tstr ...]`         | every surviving property base URL once, bytewise-sorted                                                                                                                                                             |
| 2   | `labels`                 | `[tstr or null ...]` | delivered order                                                                                                                                                                                                     |
| 3   | `typeIds`                | `[uint or null ...]` | each node's first direct type as a typeTable index; null = the store no longer serves the node or records no types                                                                                                  |
| 4   | `properties`             | `map or null`        | the SOURCE's property map: propertyTable index -> simple value, keys ascending, capped by limits.locateProperties; null = store-absent source. Neighbour nodes ship no properties - their detail is one locate away |
| 5   | `linkLabels`             | `[tstr or null ...]` | edge order                                                                                                                                                                                                          |
| 6   | `linkTypeIds`            | `[[uint ...] ...]`   | each link's direct types as typeTable indexes, canonical order preserved, capped by limits.locateLinkTypeIds; empty = store-absent link                                                                             |
| 7   | `linkTypeIdsComplete`    | `bstr`               | LSB-first bitmask, bit e set = edge e's type list is the link's whole direct set; unset = the cap truncated it or the store no longer serves it                                                                     |
| 8   | `linkProperties`         | `[map or null ...]`  | edge order: propertyTable index -> simple value, keys ascending, capped by limits.locateLinkProperties; null = store-absent link                                                                                    |
| 9   | `linkPropertiesComplete` | `bstr`               | LSB-first bitmask, bit e set = edge e's property map is the link entity's whole set                                                                                                                                 |

Property values are SIMPLE ONLY: tstr / int / f64 / bool / null - nested objects and arrays never ship. A number ships as an integer when the store renders it integral and it fits i64, as a double otherwise. An over-cap entity drops properties reverse-lexicographically by base URL with its label property protected to the very end, so the label survives every cap that admits at least one property; survivors emit ascending by name, which is ascending index order. The intern tables are the unions of every surviving reference; an index costs less than the string it replaces every time a URL repeats.

## 9. Validation contract

The decoder validates STRUCTURE: magic, version, zero flags, directory rules (slot 0 present, sequential starts, aligned boundaries, `end >= start`, slotCount at least the kind's table size), zero padding, CBOR profile conformance, identity and coordinate echoes against the request, and count consistency (`end - start` of `POSITIONS` `== 8 * delivered`, extent of `EDGE_IDS` `== 32 * edges`, and so on).

Per-point invariants - duplicate row ids, positions inside the tile extent - are NOT decoder work: delivery is slice-serving of publish-verified arrays, and the publish pipeline records the verification. A zero-copy decoder that walks every point to re-check them is zero-copy theater.

## 10. Fixtures

Checked-in fixture envelopes pin the contract bytes: the encoder writes small hand-built responses as fixtures, and every decoder implementation asserts field-for-field equality against their JSON sidecars (floats as bit patterns, never printed decimals). "Matches the server" is never asserted by eye. The fixtures live in the atlas crate under `fixtures/wire/`.
