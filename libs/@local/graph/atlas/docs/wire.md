# Atlas wire format

The binary contract for every atlas geometry response: tile, edges, and locate. The OpenAPI description the server publishes embeds this document verbatim. It is the normative text a decoder implements against.

## 1. Scope

One envelope family carries every binary response. The manifest stays JSON: read once per session, human-debuggable, and it carries the `wireVersion` pin that governs everything else. Its optional POST body is the entity-query filter document that binds the view. Data-route bodies carry no `filter` member. Transport compression is HTTP `Content-Encoding`. The envelope is compression-agnostic.

## 2. Envelope

Responses carry `application/vnd.hash.saltile-v1`. The media-type version and the prefix `wireVersion` must agree. All integers are little-endian. One response = prefix, directory, payloads, optional trailer:

| Region    | Size            | Contents                                                                                                                 |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| prefix    | 16 B            | magic u64 (`"SALTILE"` + kind), `wireVersion` u16 = 1, `flags` u16 = 0, `slotCount` u16, `reserved` u16 = 0              |
| directory | 8 B x slotCount | per slot: `start` u32, `end` u32 - absolute byte offsets, `end` exclusive and unpadded; `(0, 0)` marks an absent section |
| payloads  | per directory   | sequential in slot order, each zero-padded to 8                                                                          |
| trailer   | self-delimiting | optional CBOR tail: declared by `HEAD` (tile, edges) or mandated by kind (locate)                                        |

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

The offset directory is the locating mechanism: one fixed lookup finds any section without a linear scan or a parse. Slot meanings stay frozen per (kind, wireVersion) - section 3 carries the tables - and evolution appends slots. A decoder reads the slots it supports and ignores the rest, both trailing slots it has no table entry for and populated slots it chooses not to consume. Nothing forces a decoder to touch any payload but the ones it renders. A renderer can view `POSITIONS` straight out of the buffer before parsing a byte of CBOR.

- The format guarantees alignment by construction. The payload region starts at `16 + 8 x slotCount` (8-aligned), every `start` is 8-aligned, and `end` pads to the next 8 boundary with zero bytes (at most 7). JS typed-array views throw on misaligned offsets. Alignment is a wire contract.
- The magic's eighth byte is the response kind, ASCII initials: `T` tile, `E` edges, `L` locate (`SALTILET`, `SALTILEE`, `SALTILEL`). The seven-byte family prefix is constant. The decoder selects the expected `HEAD` schema and slot table by kind and rejects a kind that does not match the request. One `wireVersion` governs the whole family: kind discriminates grammar variant, version tracks evolution.
- Directory rules: slot 0 (`HEAD`) is always present. Present slots are strictly sequential (`start_next = align8(end_prev)`, the first present start = `16 + 8 x slotCount`), `end >= start` holds in every entry, and `slotCount` is at least the kind's table size. Present-but-empty (`start == end`, nonzero) is distinct from absent (`0, 0`): a zero-point tile carries present-empty columns, a request without `coloredTypeIds` gets an absent `TYPE_MASK`.
- Offsets are u32: directory-addressed payloads end below 4 GiB, the format's representability boundary, enforced by the producer (section 8a). The trailer is directory-external and outside that ceiling. The deepest tile's catch-all geometry is the uncapped directory case.
- Prefix `flags` and `reserved` must be zero.
- Payload order equals slot order, and prefix, directory, `HEAD`, and columns are pure functions of the bound serving state `(generation, request, visibility, server secret, serving limits)` - identical requests under identical state yield byte-identical bytes there, the property the client's application-layer cache keys on. Secret and limits are restart-stable by operator contract - changing either for an active generation requires rotating the generation and clearing application caches - which is why the cache key carries neither. Tile icons are also generation-local and byte-identical under that state. Trailer labels are not, on any detail route. A fitted identity's and a published link's label reads from the captured display held by the request's resolved scope - normally the entity's currently served edition, an earlier one while the scope's pinned publication state predates the newest capture or while the server's capture read has not answered for it. A fitted identity the scope holds no capture for reads the generation's own payload (section 7), and a post-fit published point carries the display recorded at its placement (the next bullet). The server pins publication state per scope when it resolves the scope's visibility, and re-resolves on an operator-configured reuse window - the manifest's `limits.authoritySoftSeconds` and `limits.authorityHardSeconds`, eight and ten minutes by default. A label edit after publication therefore reaches a scope's responses at that scope's next resolution, not at the server's next capture. A fitted identity's or published link's served label may lag the newest edition by the ingest cadence - up to 65 seconds (section 7) - plus the remainder of the scope's reuse window. Tile, edges, and locate move together within one scope, and two scopes resolved at different times may serve different labels for the same entity at the same moment. On edges, a link's type reference reads its current edition's representative type the same way, under the same bound. Locate type and property values - link type references included - hydrate from the live store. The store is bitemporal and an edition is immutable, so a lagging value reads as the recent past, never as a rewrite. Detailed trailer bytes on any route may therefore differ between identical requests as scopes re-resolve, store-derived values change, or entities stop or start resolving. A client must not retain a detailed response as an immutable generation tile. Cache geometry sections and refetch detail where request-time state matters.
- The serving state includes the server's **post-fit publications**: entities that enter the store after the generation's fit and that the server publishes into serving between refits. Section 8 calls a link published this way a delta link. Published entities ride the ordinary columns of every route that delivers them, so a `ROW_IDS` value may address an entity the fit never saw. Nothing in the id says so - publication ids come from the same keyed permutation as the generation's own rows (section 5). A published point's `TYPE_MASK` bits read zero whatever the request's `coloredTypeIds` lists, and its tile icon resolves through its representative type (section 6). Its label is the display captured at placement, which no later edition moves: the label stays fixed until the next refit, even as locate's store-hydrated type and property columns move with the entity. A published link's label follows the captured-display rule above and revises with the entity. Publications reach a scope at the scope's next resolution, while a withdrawal takes effect within the ingest cadence on every route - between resolutions a scope's served set never grows past what the resolution admitted. Unarchive lifts the withdrawal within the same cadence, and that ceiling decides what returns. A row the resolution admitted resumes serving once the withdrawal lifts. A row outside what the resolution admitted returns only at the scope's next resolution, whether a restricted scope's resolution folded it out of its masks or the withdrawal predates the scope's pinned publication state. An operator view folds nothing out, so a fitted row's withdrawal and its reversal both land within the cadence.

The directory declares every column's extent before the first payload byte, so prefix + directory stream first and columns follow immediately. The trailer lives outside the directory as a self-delimiting CBOR tail - declared by a `HEAD` key on tile and edges, mandated by kind on locate - whose start is `align8` of the last present column's end and whose extent is its own CBOR structure. Edges and locate trailers arrive only after their request-time store reads. Labels themselves never ride that read on any route - they resolve in process, from the label sources the freshness bullet above names. The tile trailer needs no store read. The layout is the streaming contract; current servers assemble the whole body before the first byte, so an edges or locate response's first-byte latency includes hydration. A streaming decoder is correct against both. Geometry sections decode from a partial body, and on successful responses a future streaming server changes delivery timing, never bytes. If edges hydration fails after a streaming server has sent the columns, the trailer arrives valid and empty-shaped: the in-process labels remain, while the type table is empty and type references are null. If locate hydration fails at that point, its empty-shaped trailer has null labels and values alongside empty tables, with every completeness bit unset. Neither route sends a truncated body. Problem documents cover only failures before the first body byte.

## 3. Slot tables

The (kind, slot) pair names each section; the names are labels, the slots are the wire. Frozen per (kind, wireVersion). Additions append.

`SALTILET` (tile), slotCount = 5:

| Slot | Section     | Contents                                                                                                                                                                                                      |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `HEAD`      | CBOR map (deterministic encoding)                                                                                                                                                                             |
| 1    | `POSITIONS` | f32 xy pairs, delivered order (8 B/point)                                                                                                                                                                     |
| 2    | `ROW_IDS`   | u32, delivered order (4 B/point)                                                                                                                                                                              |
| 3    | `TYPE_MASK` | per-point bitmasks, delivered order (ceil(n/8) B/point, n = request's coloredTypeIds count)                                                                                                                   |
| 4    | `MASS`      | u32, delivered order - reserved: a wireVersion-1 server marks it absent `(0, 0)`; a decoder reads a populated `MASS` by this declared type or ignores it, per the section 2 evolution rule - never rejects it |

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

Trailer (all kinds): CBOR tail outside the directory - declared by the `HEAD` `trailer` key on tile and edges, always present on locate.

Locate property values are the entity's **deliverable set** for the requesting actor: every property the store's actor-specific protection does not withhold. Atlas compiles the property selections through that store rule using the actor and instance-admin status resolved with the view. An entitled owner receives a protected value that the store permits, a stranger does not, and an instance admin reads unmasked. A withheld property's absence is invisible in the completeness flags, which measure completeness against that actor's deliverable set.

Labels are exempt from property masking and arrive as-is. [BE-313](https://linear.app/hash/issue/BE-313/email-filter-protection-embeddings-and-labels) tracks this correspondence with the graph's own label behavior.

`POSITIONS` interleaves xy within one section (a vec2 vertex attribute, stride 8); SoA applies per attribute, never within one attribute.

`TYPE_MASK` gives point p its bitmask at byte offset `p * ceil(n/8)`: bit i (byte `i >> 3`, bit `i & 7`, LSB-first) = the point carries the request's type i. No-match is the zero mask - no sentinel exists - and multi-typed points carry every matching bit; which color paints, blends, or badges is the client's policy, re-prioritizable without a re-fetch. A mask read as its set-bit indexes is the point's colored-type index list. At n <= 8 the column is one byte per point.

The `coloredTypeIds` entries are user-facing _versioned_ type URLs. A malformed entry rejects the body (`invalid-body`). The server resolves each against the generation's snapshot with descendant expansion. A point matches type i when it carries the requested type or any descendant of it. A well-formed URL that resolves to no type in this generation is legal - it never matches, so its bit reads 0 in every point's mask. A post-fit published point (section 2) carries the zero mask whatever the request lists: matching resolves against the generation's snapshot, which never saw it. `TYPE_MASK` rides only requests that supply `coloredTypeIds` - absent otherwise (directory `(0, 0)`).

## 4. CBOR profile

RFC 8949 section 4.2.1 deterministic encoding with these restrictions - definite lengths only, integer map keys, and no tags or indefinite items - and one deliberate divergence from section 4.2.1's preferred serialization. Floats keep their originating type's width, never shortened. Geometry and `HEAD` floats are always IEEE 754 single (they originate as f32 even where a half preserves the value), and property values are always double (store scalars are doubles). The width carries the type, and byte shapes stay value-independent. The same profile canonicalizes request bodies for cache keys.

## 5. Identifiers

Node row ids and entity ids cross the wire as separate identity domains:

- Node row ids (`ROW_IDS`, `EDGE_SOURCES`, `EDGE_TARGETS`, and the locate request's `row`) are opaque, sparse u32 values. An id stays consistent across every endpoint of one generation and comes from a keyed permutation of the full u32 range, so the generation's row count never bounds it. Ids are not stable across generations - re-translate after a generation change. Any u32 value is well-formed, and values the server never issued resolve to nothing. A post-fit publication's id (section 2) comes from the same permutation as rows allocate, so nothing in an id says which serving domain it names. The permutation's design target is that ids carry no ordering, adjacency, creation-time, or count information; that hiding is the construction's target, not a demonstrated boundary. Treat ids as meaningless handles either way.
- Entity ids (`EDGE_IDS`, the locate `HEAD`'s `entityId`) are 32 raw bytes: the web uuid then the entity uuid, sixteen bytes each, untagged. They are upstream identities - stable across generations - and every delivered edge carries one (identity is generation-frozen, never store hydration).

Edges carry no wire id of their own: a link entity's id is its identity in every binary response, and edge delivery order is ascending `EDGE_IDS` bytes - client-verifiable from the column alone.

## 6. Tile response

`HEAD` keys:

| Key | Name          | Type        | Meaning                                                                                                                   |
| --- | ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| 0   | `generation`  | `bstr(32)`  | sha256 identity, echoes the route                                                                                         |
| 1   | `variant`     | `uint`      | the route's variant as its index in the manifest `variants` list                                                          |
| 2   | `coordinate`  | `[z, x, y]` | uints, echoes the route                                                                                                   |
| 3   | `mode`        | `uint`      | 0 = delta, 1 = total                                                                                                      |
| 4   | `delivered`   | `uint`      | point count in this response                                                                                              |
| 5   | reserved      | -           | -                                                                                                                         |
| 6   | `firstBucket` | `uint`      | b0 of the `runs` array                                                                                                    |
| 7   | `runs`        | `[uint...]` | per-bucket delivered counts, buckets b0.. (note below)                                                                    |
| 8   | `global`      | `map`       | post-intersection set metadata (note below)                                                                               |
| 9   | `children`    | `uint`      | occupied-child bitmask, bit `i` = Morton child `i` holds an undelivered visible point below this zoom's cut; 0 = complete |
| 10  | `trailer`     | `bool`      | a CBOR trailer tail follows the last column (echoes a `detail: "auxiliary"` request)                                      |
| 11  | reserved      | -           | -                                                                                                                         |

In `runs`, a delta response carries one entry with b0 = z+m+k and a total response carries z+m+k+1 entries with b0 = 0. Zero-length entries keep their positional slot, so bucket = b0 + i always holds - the zoom-0 delta root is the one delta case with m+k+1 entries (buckets 0..=m+k, b0 = 0). `runs` is what a progressive renderer paints from (total responses are bucket-major, coarse structure first), with bucket b0+i's rows at column offset `sum(runs[..i])`. A full-visibility caller has `k = 0` and the manifest's `bucketSchedule` as its schedule. A restricted caller reads `k` from the manifest's `scopeSchedule` block, which declares the resolved delivery-cut offset beside the authority token.

Restricted views deliver from their own schedule. The server builds a first-occupant cascade over exactly the visible rows, under the corpus rank restricted to them. The deepest bucket, `maxZoom + m + k`, is the catch-all. A response delivers one contiguous interval of scope buckets, ascending by bucket and in Morton order within each, without fill: every run counts exactly its bucket's delivered points. Delta accumulation therefore stays duplicate-free with zero client-side bookkeeping, and a total response is exactly the accumulated view of its extent. Every run, count, and child bit derives from the visible rows alone, so a restricted response carries no evidence of what its mask removed.

`global` sub-keys - required on the root tile (z = 0, the bootstrap camera framing datum), permitted on every tile response:

| Key | Name            | Type        | Meaning                                                                            |
| --- | --------------- | ----------- | ---------------------------------------------------------------------------------- |
| 0   | `visible`       | `uint`      | visible count at the current zoom                                                  |
| 1   | `bounds`        | `[4 x f32]` | tight wire-frame extent of the entire visible set; absent iff that set is empty    |
| 2   | `minResolution` | `uint`      | the deepest bucket the visible set occupies: the coarsest cut delivering all of it |

- One 32-byte identity echo pins everything: the generation id is sha256 of the generation's metadata document, which carries every artifact digest. The echo exists so a decoder rejects a stale or misrouted cache body before its arrays reach a renderer.
- `complete` does not ride the tile wire: `children == 0` is the completeness signal, in both modes (nothing deeper exists).
- The format reserves `children` bits beyond the low four as zero. A diving client walks exactly the occupied frontier - no empty-tile probes. A cell with no quad node answers `children = 0` (its points, if any, were all delivered by ancestor cuts). Under an active filter the truthful bitmask is post-intersection, like every `global` aggregate.
- No response-level type summary rides `HEAD`: "which requested types are active here" is the bitwise union of the `TYPE_MASK` column, derivable in the same decode pass that colours dots.
- Truncation is detectable from the directory alone: the response must extend to `align8(end)` of the last present slot, plus a complete CBOR item when `HEAD` declares the trailer - a stream ending early is an error even without Content-Length.
- Every `global` aggregate is a post-intersection quantity (authorization and filter).

Tile trailer, present iff the request set `detail: "auxiliary"`:

| Key | Name     | Type                 | Meaning         |
| --- | -------- | -------------------- | --------------- |
| 0   | `labels` | `[tstr or null ...]` | delivered order |
| 1   | `icons`  | `[tstr or null ...]` | delivered order |

Icons come from the generation's published identity artifacts, or from the publication's own record for a type the generation never fitted. A fitted point's icon is the nearest declared icon over its direct types, depth ties broken by the artifact's own type order. A post-fit published point (section 2) resolves through its representative type alone: that type's nearest declared icon when the generation fitted the type, and the icon the server recorded at allocation when it did not. Labels resolve in process and need no live-store hydration: a fitted row reads the scope's pinned captured display first and the generation's published payload when the scope holds no capture, and a post-fit published point reads the display recorded at its placement (section 2 states the caching consequences and the freshness bound). The trailer-last layout still permits geometry-first streaming, although current servers buffer the whole body. Section 2 defines this identity and timing distinction. Null marks a label whose source carries an empty label. A null icon marks a point for which the rules above find no declared icon.

## 7. Edges response

`HEAD` keys:

| Key | Name         | Type       | Meaning                                                                                                     |
| --- | ------------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| 0   | `generation` | `bstr(32)` | sha256 identity, echoes the route                                                                           |
| 1   | `variant`    | `uint`     | the route's variant as its index in the manifest `variants` list                                            |
| 2   | `count`      | `uint`     | edge count in this response                                                                                 |
| 3   | `complete`   | `bool`     | false = the rank-ordered cap truncated the set (auth-invisible edges are not truncation - missing = denied) |
| 4   | `trailer`    | `bool`     | a CBOR trailer tail follows the last column (echoes a `detail: "auxiliary"` request)                        |

The request's `tiles` list is not echoed. It rides the POST body, responses are `private, no-store`, and the generation echo pins identity. Column extents are `4 x count` for the endpoint columns and `32 x count` for `EDGE_IDS`. Delivery order is ascending `EDGE_IDS` bytes, independent of the tiles listed and of truncation, so identical requests yield identical column bytes under section 2's identity state. All information references the most recent edition of each referenced entity visible to the serving Atlas process; section 2 bounds the lag - the ingest cadence, up to 65 seconds, plus the scope's reuse window for additions and revisions, the cadence alone for removals. A link's label and representative type resolve in process: from the display the scope holds captured at the link's currently served edition, and from the generation's own payload for a fitted link the scope holds no capture for. Section 2 states the caching consequences. The trailer as a whole is outside that identity guarantee (section 2). Every delivered edge has both endpoints in the listed tiles' delivered row sets. Sources and targets reference node row ids the client already holds for those tiles. "Delivered row set" means what the tile route delivers to this view: the corpus schedule's cumulative prefix through `z + span` for an operator view, and the view's own cascade through `z + span + k` for a restricted one. A restricted view's edges are therefore drawn among exactly the dots its own tiles rendered.

Edges trailer, present iff the request set `detail: "auxiliary"` (edge order):

| Key | Name          | Type                 | Meaning                                                                                                                                                    |
| --- | ------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `typeTable`   | `[tstr ...]`         | the type intern table: every referenced versioned type URL once, bytewise-sorted                                                                           |
| 1   | `linkLabels`  | `[tstr or null ...]` | edge order                                                                                                                                                 |
| 2   | `linkTypeIds` | `[uint or null ...]` | each link's representative type as a typeTable index; `null` marks a representative the store no longer resolves, which a healthy lifecycle never produces |

## 8. Locate response

`HEAD` keys:

| Key | Name                 | Type        | Meaning                                                                                                                                                                                        |
| --- | -------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `generation`         | `bstr(32)`  | sha256 identity, echoes the route                                                                                                                                                              |
| 1   | `variant`            | `uint`      | the route's variant as its index in the manifest `variants` list                                                                                                                               |
| 2   | `count`              | `uint`      | delivered node count (source included)                                                                                                                                                         |
| 3   | `zoom`               | `uint`      | the source's first visible zoom                                                                                                                                                                |
| 4   | `cell`               | `[z, x, y]` | the source's tile at that zoom - the client's fly-to target                                                                                                                                    |
| 5   | `edges`              | `uint`      | delivered edge count                                                                                                                                                                           |
| 6   | `complete`           | `bool`      | false = the locate edge cap truncated the subgraph (auth-invisible edges are not truncation - missing = denied)                                                                                |
| 7   | `entityId`           | `bstr(32)`  | the source's upstream entity id: web uuid then entity uuid - the by-row flow's identity answer                                                                                                 |
| 8   | `typeIdsComplete`    | `bool`      | the request's coloredTypeIds cover every direct type of the source; false on an empty request set and for a source the store no longer serves                                                  |
| 9   | `propertiesComplete` | `bool`      | the trailer's source property map is the entity's whole **deliverable** set; false when the scalar-value filter or the property cap dropped anything, or the store no longer serves the source |

Delivered node order is source first, then the delivered edges' partners ascending by wire row id. A partner whose every edge truncated is not delivered. The source's row id and position are `ROW_IDS[0]` / `POSITIONS[0]`. No `HEAD` key repeats them. `zoom` is the zoom at which the source's dot first becomes visible to this view - the cut rule inverted over the schedule the view delivers under, `z + span` for an operator view and `z + span + k` for a restricted one. A restricted view's answer is a function of its own visible rows, so it carries no evidence of what its mask removed. `cell` is its tile there. Identical requests yield identical prefix, directory, `HEAD`, and column bytes under section 2's identity state. Trailer labels, admitted by request-time entity resolution, resolve in process: a fitted row reads the scope's pinned captured display first and the generation's payload without one, and a published point reads its placement display. Link labels follow section 7's rule, so a revised link serves the same label here as on edges under the same scope (section 2). Type and property columns reflect live store state. The trailer as a whole is therefore outside that identity guarantee (section 2). The request's `entityId` is not echoed (POST body + `private, no-store` + the generation echo).

Edge columns carry the source's ego graph - every edge incident to the source, both directions, a self-loop exactly once, its other endpoint visible - ascending `EDGE_IDS` bytes, capped by `limits.locateEdges`. Fitted edges and the server's published delta links qualify alike, under one cap and one order, so the ego graph spans both serving domains whatever domain the source resolves in. Truncation keeps the edges whose partners lie nearest the source, ascending (squared wire-frame distance to the partner, partner first-visible zoom, `EDGE_IDS` bytes). The key only selects - presentation stays ascending `EDGE_IDS` bytes - and `HEAD` reports `complete: false`. `edges: 0` with `complete: true` is the correct answer for an unlinked source: the ego-graph of an isolated dot is the dot.

Locate trailer, always present - locate is the detail view. Its labels resolve in process. A fitted row reads the scope's pinned captured display first, falling back to the generation's payload, and a published point reads its placement display. They read null when the request-time store does not resolve the corresponding entity or when the label its source carries is empty. The intern tables first, then node arrays in delivered order and link arrays in edge order, every type and property reference a uint index into its table:

| Key | Name                     | Type                 | Meaning                                                                                                                                                                                                                      |
| --- | ------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | `typeTable`              | `[tstr ...]`         | every referenced versioned type URL once, bytewise-sorted                                                                                                                                                                    |
| 1   | `propertyTable`          | `[tstr ...]`         | every surviving property base URL once, bytewise-sorted                                                                                                                                                                      |
| 2   | `labels`                 | `[tstr or null ...]` | delivered order                                                                                                                                                                                                              |
| 3   | `typeIds`                | `[uint or null ...]` | each node's representative type as a typeTable index; null = the store no longer serves the node or records no types                                                                                                         |
| 4   | `properties`             | `map or null`        | the source's property map - propertyTable index -> scalar value, keys ascending, capped by limits.locateProperties (null = store-absent source). Neighbour nodes arrive without properties - their detail is one locate away |
| 5   | `linkLabels`             | `[tstr or null ...]` | edge order                                                                                                                                                                                                                   |
| 6   | `linkTypeIds`            | `[[uint ...] ...]`   | each link's direct types as typeTable indexes, canonical order preserved, capped by limits.locateLinkTypeIds; empty = store-absent link                                                                                      |
| 7   | `linkTypeIdsComplete`    | `bstr`               | LSB-first bitmask in whole 8-byte words (`ceil(edges/64) * 8` bytes, padding bits zero), bit e set = edge e's type list is the link's whole direct set; unset = the cap truncated it or the store no longer serves it        |
| 8   | `linkProperties`         | `[map or null ...]`  | edge order - propertyTable index -> scalar value, keys ascending, capped by limits.locateLinkProperties; null = store-absent link                                                                                            |
| 9   | `linkPropertiesComplete` | `bstr`               | LSB-first bitmask in whole 8-byte words (`ceil(edges/64) * 8` bytes, padding bits zero), bit e set = edge e's property map is the link entity's whole **deliverable** set                                                    |

Property values are scalar values only (tstr / int / f64 / bool / null) - nested objects and arrays never cross the wire. A number encodes as an integer when the store renders it integral and it fits i64, as a double otherwise. An over-cap entity drops properties reverse-lexicographically by base URL, keeping the request-time edition's label property until last. The property's survival does not change the already-published label payload. Survivors emit ascending by name, which is ascending index order. The intern tables are the unions of every surviving reference, and an index costs less than the string it replaces every time a URL repeats.

## 8a. Problem documents

Routed requests that fail answer RFC 9457 `application/problem+json`; the `type` member is a stable root-relative URI (`/problems/atlas/<slug>`) and `detail` is prose, contractually free. Internal failures (500) carry a static `detail` - driver errors and panic payloads are server-log material and never reach a client. Extraction failures are problem documents too. An absent required body answers `missing-body`, a body that is not the operation's JSON shape (malformed JSON, a wrong content type, an entry that fails its field's parse) answers `invalid-body`, and an unparsable tile address answers `invalid-coordinate`. Only the router's own rejections - an unmatched route, a wrong method - stay plain.

Every route answers under every scope. A proof carries a mask per identity domain, so a link row's authorization is a statement the proof holds and its endpoints do not imply. Refusals are per row, an unproven row is absent, and a scope that may see nothing receives a well-formed response that delivers nothing. Translate's `edges` map holds exactly the link ids whose link row and both endpoints the proof admits.

Trailer detail and deepest-zoom tile geometry carry no byte ceiling, stated rather than capped. Tile trailers carry in-process labels and icons. Edges and locate trailers combine in-process labels with request-time type or property text. Edge and locate count limits cap entries, not bytes. Tile trailer entries follow the delivered point count, and no count limit covers a deepest cell. No byte bound applies per text value or per trailer. A deepest-zoom tile's geometry is the second class. The deepest bucket is the catch-all for co-located rows, and nothing caps how many rows share one cell. No published or configured ceiling covers that observed excess - the wire format itself is the only bound (directory offsets are u32, so directory-addressed geometry ends below 4 GiB, enforced as a caught producer panic rather than a manifest limit or preflight; trailers sit outside the directory and share no such ceiling) - and the geometry columns of edges, locate, and tiles above the deepest zoom stay provable from the manifest's limits. A detailed response of any kind still carries an unbounded trailer. Streamed assembly and store-side query shaping are the staged directions for large-response delivery. Neither bounds total bytes unless a future contract says so explicitly.

## 9. Validation contract

The decoder validates the magic, version, zero flags, directory rules (slot 0 present, sequential starts, aligned boundaries, `end >= start`, slotCount at least the kind's table size), zero padding, CBOR profile conformance, identity and coordinate echoes against the request, and count consistency (`end - start` of `POSITIONS` `== 8 * delivered`, extent of `EDGE_IDS` `== 32 * edges`, and so on).

Per-point invariants - duplicate row ids, positions inside the tile extent - are not decoder work: delivery is slice-serving of publish-verified arrays, and the publish pipeline records the verification. A zero-copy decoder that walks every point to re-check them is zero-copy theater.

## 10. Fixtures

Checked-in fixture envelopes pin the contract bytes. The encoder writes small hand-built responses as fixtures, and every decoder implementation asserts field-for-field equality against their JSON sidecars (floats as bit patterns, never printed decimals). "Matches the server" is never asserted by eye. The fixtures live in the atlas crate under `fixtures/wire/`.

One fixture, `r1-scoped-route-tile`, carries served bytes rather than hand-built ones. Its manifest resolution over a live store declared a nonzero `scopeSchedule` offset beside the authority token, and the tile request presented that token. The sidecar records the served declaration verbatim beside the response bytes, and decoders derive that fixture's delivery cut from the recorded declaration rather than from a constant, which makes it the declaration-readback witness. The capture and verification harness is the atlas crate's `tests/route_fixture.rs`.
