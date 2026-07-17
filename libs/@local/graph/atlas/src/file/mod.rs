//! On-disk file formats for atlas artifacts.
//!
//! Two formats are defined: `.salt`, a container for any binary artifact
//! the atlas persists, and `.quad`, a salt quadtree. Everything below is
//! normative for `.salt` layout version 1. All multi-byte integers are
//! little-endian, all offsets and lengths are in bytes, and all text is
//! ASCII unless stated otherwise.
//!
//! # The salt store
//!
//! A salt store is one `.salt` container plus zero or more opaque blob
//! files beside it:
//!
//! ```text
//! atlas.salt                              preamble, directory, inline data
//! 0000000000000000000000000000002a.blob   opaque blob file
//! 0000000000000000000000000000002b.quad   opaque blob file (.quad bytes)
//! ```
//!
//! There is only ever one `.salt` file, and it is the single root of
//! trust. Blob files carry no structure of their own; the container's
//! directory describes their interiors exactly as it describes its own
//! inline data.
//!
//! A *content* is one storage target: [`INLINE_CONTENT_ID`] (zero) is the
//! container's inline data region, and every other content id names one
//! blob file. A *section* is one typed byte range inside a content.
//! Section ids are unique per store, not per content, so a section id
//! alone identifies a section; its directory entry says where it lives.
//! What sections *mean* (roles, groupings, strong audit hashes) is
//! application metadata, stored in [`SECTION_TYPE_DOCUMENT`] sections.
//! Reclaiming blob files that no container references is out of scope for
//! this format.
//!
//! A container is either *unsealed* (a work in progress with provisioned
//! capacity) or *sealed* (immutable; published generations are always
//! sealed).
//!
//! # `.salt` container layout
//!
//! ```text
//! segment 0             preamble
//! segments 1..=N        preamble extensions: the content mapping
//! directory segments    entry runs, one per mapped content, in order
//! data region           inline section payloads (content id zero)
//! ```
//!
//! The header region operates in segments of [`SEGMENT_BYTES`] (4096)
//! bytes; each segment's final 8 bytes are a CRC-64/NVME checksum over its
//! first 4088. Every segment checksum is valid at all times: writers
//! checksum a segment in the same write that fills it. The data region is
//! not segment-framed - payloads are covered by per-entry checksums - and
//! it starts at the first segment boundary after the last directory
//! segment, an offset fully determined by `N` and the mapping. `N` is
//! fixed when the container is created, so the data region never moves.
//!
//! ## The preamble
//!
//! Segment 0 is the [`SaltPreamble`]:
//!
//! | offset | size | field                                                  |
//! |--------|------|--------------------------------------------------------|
//! | 0      | 4    | magic `SALT`                                           |
//! | 4      | 4    | layout version, `u32` = 1                              |
//! | 8      | 4    | container flags, `u32`                                 |
//! | 12     | 4    | preamble extension count `N`, `u32`, at least 1        |
//! | 16     | 8    | total occupied entry count, `u64`; zero while unsealed |
//! | 24     | 8    | container length, `u64`; zero while unsealed           |
//! | 32     | 4056 | reserved, must be zero                                 |
//! | 4088   | 8    | segment checksum                                       |
//!
//! Container flags define bit 0, [`SaltFlag::Sealed`]; other bits must be
//! zero. In a sealed container the entry count is the number of occupied
//! directory entries and the length is the exact file length, which lets a
//! reader detect truncation before touching any payload. The preamble is
//! written exactly twice: at creation and at sealing.
//!
//! ## Preamble extensions: the content mapping
//!
//! Segments `1..=N` are [`PreambleExtension`]s holding [`ContentMapping`]
//! records, 170 per segment:
//!
//! | offset | size | field                                       |
//! |--------|------|---------------------------------------------|
//! | 0      | 16   | content id, `u128`                          |
//! | 16     | 4    | run length in directory segments, `u32`     |
//! | 20     | 4    | reserved, must be zero                      |
//!
//! Occupied records form a prefix across the extension run; unoccupied
//! records are all-zero. Records appear in the order of the directory
//! segment runs they describe: the prefix sum of the lengths locates every
//! run, and the sum of all lengths locates the data region. Each mapped
//! content id appears exactly once with a nonzero length. A final record
//! with content id [`VACANT_CONTENT_ID`] (`u128::MAX`) describes
//! provisioned spare directory segments; appending a content claims spare
//! segments by inserting its record before the vacant one and shrinking
//! it, so nothing behind the mapping ever moves.
//!
//! ## Directory segments
//!
//! A [`DirectorySegment`] holds 31 entry slots of 128 bytes, then 120
//! reserved zero bytes, then the segment checksum. A content's run is one
//! or more consecutive directory segments; the content and its payloads
//! are appended as one unit, so a run's segments are checksummed the
//! moment they are written.
//!
//! Occupied entries form a prefix of the run, strictly ascending by
//! section id across the run's segments; the remaining slots are vacant. A
//! slot is vacant when its section id is [`VACANT_SECTION_ID`]
//! (`u32::MAX`) and every other byte is zero. Section ids may skip values:
//! ascending order, not density, is required. Occupancy is not stored per
//! segment; the vacant sentinel sorts after every real id, so binary
//! search over a whole run works without counts.
//!
//! Each occupied slot is a [`DirectoryEntry`]:
//!
//! | offset | size | field                                                    |
//! |--------|------|----------------------------------------------------------|
//! | 0      | 4    | section id, `u32`                                        |
//! | 4      | 2    | section type, `u16`, nonzero                             |
//! | 6      | 2    | entry flags, `u16`                                       |
//! | 8      | 8    | start offset, `u64`                                      |
//! | 16     | 8    | end offset, `u64`, exclusive; `start < end`              |
//! | 24     | 96   | section metadata; layout is defined by the section type  |
//! | 120    | 8    | payload checksum over the section's bytes                |
//!
//! Offsets index into the owning content's bytes: the container file for
//! the inline content, the blob file otherwise. Metadata bytes beyond what
//! the section type defines must be zero, and section types that define no
//! metadata require all 96 bytes zero.
//!
//! Section types (values above `0x00FF` are reserved):
//!
//! | value    | name                          | payload                     |
//! |----------|-------------------------------|-----------------------------|
//! | `0x0001` | [`SECTION_TYPE_DOCUMENT`]     | a UTF-8 JSON document       |
//! | `0x0002` | [`SECTION_TYPE_OPAQUE`]       | uninterpreted bytes         |
//! | `0x0003` | [`SECTION_TYPE_SCALAR_ARRAY`] | a scalar array typed by its |
//! |          |                               | entry metadata              |
//! | `0x0004` | [`SECTION_TYPE_QUAD_TREE`]    | `.quad` quadtree topology   |
//! | `0x0005` | [`SECTION_TYPE_POINT_CLOUD`]  | point-cloud data for one    |
//! |          |                               | quadtree node               |
//!
//! A section type value fixes its metadata layout forever; changing a
//! metadata layout requires a new section type value.
//!
//! Entry flags define bit 0, [`EntryFlag::ValidationRequired`], and bit 1,
//! [`EntryFlag::Volatile`]; other bits must be zero. `ValidationRequired`
//! demands eager payload checksum verification at open; without it,
//! verification may be lazy. An entry whose section type is unknown cannot
//! be validated, so `ValidationRequired` on an unknown type reads as *must
//! understand*. `Volatile` selects the failure response - drop the entry
//! rather than reject the container - for both checksum mismatches and
//! unknown types.
//!
//! ## Scalar array metadata
//!
//! A [`SECTION_TYPE_SCALAR_ARRAY`] entry types its payload through
//! [`ScalarArrayMetadata`] at metadata offset 0:
//!
//! | offset | size | field                                              |
//! |--------|------|----------------------------------------------------|
//! | 0      | 2    | scalar type, `u16`                                 |
//! | 2      | 2    | rank, `u16`, in `1..=8`                            |
//! | 4      | 4    | reserved, must be zero                             |
//! | 8      | 64   | shape, `[u64; 8]`; dimensions past rank are zero   |
//!
//! Scalar types:
//!
//! | value | scalar | width |
//! |-------|--------|-------|
//! | 1     | `u8`   | 1     |
//! | 2     | `u16`  | 2     |
//! | 3     | `u32`  | 4     |
//! | 4     | `u64`  | 8     |
//! | 5     | `i8`   | 1     |
//! | 6     | `i16`  | 2     |
//! | 7     | `i32`  | 4     |
//! | 8     | `i64`  | 8     |
//! | 9     | `f16`  | 2     |
//! | 10    | `bf16` | 2     |
//! | 11    | `f32`  | 4     |
//! | 12    | `f64`  | 8     |
//!
//! The product of the first `rank` dimensions times the scalar width
//! equals the section length `end - start`. No dimension is zero.
//!
//! ## Content ids
//!
//! A content id is a writer-assigned 128-bit identifier. Zero is the
//! inline content and `u128::MAX` the spare marker; writers assign any
//! other value to blob files, and 128 bits fit standard UUIDs, whose
//! uniqueness keeps blob file names stable across containers that share
//! them. A blob file's name is derived, never stored: the content id as 32
//! lowercase hexadecimal characters, plus an extension chosen by the type
//! of the content's lowest section id - `quad` for
//! [`SECTION_TYPE_QUAD_TREE`], `points` for [`SECTION_TYPE_POINT_CLOUD`],
//! and `blob` otherwise.
//!
//! ## Storage rules
//!
//! Inline sections start at 4096-byte boundaries in the data region, in
//! ascending offset order without overlap, and gap bytes are zero, so
//! every inline section start is page-aligned for mapping and SIMD
//! access. Appending places each payload at the first boundary after the
//! previous end, so existing bytes never move. In a sealed container the
//! container length equals the end of the last inline section, or the end
//! of the header region when there is none.
//!
//! A blob file is tiled exactly by its content's sections: the first
//! starts at 0, consecutive sections are contiguous, and the last ends at
//! the file length. No alignment is imposed inside blob files; a format
//! that wants aligned interiors declares [`SECTION_TYPE_OPAQUE`] padding
//! sections, which are part of the content's bytes. Blob files are never
//! mutated in place: revised content is written under a fresh content id
//! and old files are deleted after the containers naming them retire, so
//! served files stay cacheable forever.
//!
//! ## Lookup
//!
//! A reader locates a content by scanning the mapping - at most `N`
//! segments of prefix-summed records, one page each - or by binary search
//! when content ids were assigned monotonically (for example `UUIDv7`), in
//! which case mapping order and id order coincide. Within a run, sections
//! are found by binary search over the slots, the vacant sentinel sorting
//! last. Section-id-to-content resolution without application metadata is
//! a scan over the mapping's runs.
//!
//! ## Appending and sealing
//!
//! Appending a content writes, in order: its payload bytes (inline tail or
//! new blob file), its directory segments complete with checksums, and one
//! preamble extension segment updating the mapping (its record inserted
//! before the shrunk vacant record). A crash before the mapping write
//! leaves orphaned, unreferenced bytes; a torn directory or extension
//! segment fails its checksum and recovery re-vacates it. Damage is
//! confined to the content being appended.
//!
//! Sealing rewrites the preamble with the total entry count, the container
//! length, and the [`SaltFlag::Sealed`] flag, then renames the container
//! into place atomically. Sealing preserves the directory verbatim; spare
//! capacity is not reclaimed. Compaction is a separate, explicit rewrite
//! into a fresh container.
//!
//! ## Integrity
//!
//! Every checksum is CRC-64/NVME (see [`Checksum`]; the checksum of the
//! empty byte sequence is zero). Segment checksums authenticate the
//! preamble, the mapping, and every directory slot; entry checksums
//! authenticate section payloads wherever they live, so a store can be
//! verified end-to-end from the container alone. Checksums detect
//! corruption and torn writes; they are not collision-resistant, so
//! applications needing content identity or tamper evidence record strong
//! hashes in their own metadata.
//!
//! Failures resolve per entry where possible: a payload checksum mismatch
//! (or an unknown type under `ValidationRequired`) drops the entry when it
//! is `Volatile` and fails the container otherwise. A segment whose
//! checksum fails is an interrupted append in an unsealed container -
//! recovery re-vacates it - and corruption in a sealed one.
//!
//! ## Reader obligations
//!
//! A reader accepts a sealed container only after checking, in order: the
//! magic, version, and flags; the preamble checksum; that the container
//! length equals the file length; every segment checksum; and every
//! structural rule above (mapping prefix and record validity, run
//! lengths, sorted entry prefixes, section id uniqueness, bounds,
//! alignment, metadata validity, zero padding). Payloads flagged
//! `ValidationRequired` are verified at open; other payload checksums may
//! be verified lazily on first access, and must all be verified by any
//! tool that reports a store as intact. Unknown section types are skipped
//! subject to the flag semantics; unknown versions, unknown flag bits, and
//! nonzero reserved fields are rejected.
//!
//! Unsealed containers are read only by their writer and by recovery
//! tooling, under the same rules with the two preamble counters ignored.
//!
//! ## Limits
//!
//! `N` extension segments map up to `170 * N` contents; each content's run
//! is up to `2^32 - 1` segments of 31 sections each. Offsets and lengths
//! are `u64`; section ids are `u32`; array rank is at most 8. Capacity
//! choices (`N`, spare segments) are fixed at creation.
//!
//! # `.quad` quadtrees
//!
//! A salt quadtree pointmap is two kinds of content: one *quad-tree*
//! content holding the topology (node table, bounds, and the content ids
//! of the point clouds its nodes reference) and one *point-cloud* content
//! per node holding that node's points. Splitting them makes updates
//! local: adding or removing a node writes the affected point-cloud blob
//! files and one new tree, and touches nothing else. Stored as blob files
//! they are served directly and replaced independently; stored inline, a
//! whole pointmap travels in a single `.salt` file.
//!
//! A standalone `.quad` file carries a quad-tree content's bytes. Its
//! first 4096 bytes are a preamble with the same checksum framing,
//! beginning with magic `QUAD` and a `u32` layout version. The tree
//! payload (node table, Morton ordering, bucket cascade) and the
//! point-cloud encoding are not yet specified; the version stays 0 and
//! both are unstable until they are.
//!
//! # Implementation layers
//!
//! [`ll`] fixes the raw images: sizes, field order, endianness, and pinned
//! identity (magic and version are single-variant [`zerocopy::TryFromBytes`]
//! enums, so bytes of the wrong format fail to parse). Everything else
//! there admits any bit pattern. Validated types whose constructors
//! enforce the structural rules above are built on top of [`ll`]; rules
//! that span segments or the whole container (prefix sums, sorted runs,
//! gap zeroing) belong to the container codec built on those.
//!
//! [`SEGMENT_BYTES`]: ll::preamble::SEGMENT_BYTES
//! [`SaltPreamble`]: ll::preamble::SaltPreamble
//! [`SaltFlag::Sealed`]: ll::salt::SaltFlag::Sealed
//! [`PreambleExtension`]: ll::segment::PreambleExtension
//! [`ContentMapping`]: ll::segment::ContentMapping
//! [`DirectorySegment`]: ll::segment::DirectorySegment
//! [`INLINE_CONTENT_ID`]: ll::segment::INLINE_CONTENT_ID
//! [`VACANT_CONTENT_ID`]: ll::segment::VACANT_CONTENT_ID
//! [`DirectoryEntry`]: ll::entry::DirectoryEntry
//! [`ScalarArrayMetadata`]: ll::entry::ScalarArrayMetadata
//! [`VACANT_SECTION_ID`]: ll::entry::VACANT_SECTION_ID
//! [`SECTION_TYPE_DOCUMENT`]: ll::entry::SECTION_TYPE_DOCUMENT
//! [`SECTION_TYPE_OPAQUE`]: ll::entry::SECTION_TYPE_OPAQUE
//! [`SECTION_TYPE_SCALAR_ARRAY`]: ll::entry::SECTION_TYPE_SCALAR_ARRAY
//! [`SECTION_TYPE_QUAD_TREE`]: ll::entry::SECTION_TYPE_QUAD_TREE
//! [`SECTION_TYPE_POINT_CLOUD`]: ll::entry::SECTION_TYPE_POINT_CLOUD
//! [`EntryFlag::ValidationRequired`]: ll::flags::EntryFlag::ValidationRequired
//! [`EntryFlag::Volatile`]: ll::flags::EntryFlag::Volatile
//! [`Checksum`]: crate::integrity::Checksum

// Design notes (rationale, not contract):
//
// - Replaces `salt::storage::mmap` (`SALTMMAP`). That format is one artifact per file with an
//   internal section table; identity, dedupe, and cross-file consistency all live outside the
//   format in JSON manifests. Here one container is the unit of consistency: one directory
//   describing every file, one small file to rename for an atomic publish.
// - Prior art the layout leans on: ELF section headers (fixed-size entries whose fields are
//   reinterpreted by section type), safetensors/GGUF/Arrow (typed dtype+shape metadata in a header,
//   aligned raw buffers behind it), PNG (per-chunk CRC, mirrored by the per-entry payload
//   checksum), OCI image layout (id-named blobs beside an index that describes them), and
//   flash/FAT-style erased sentinels (all-ones = never written, at record, slot, and mapping
//   granularity).
// - Not zip: zip's central directory sits at end-of-file (hostile to validate-then-mmap), CRC-32 is
//   weak, offsets need zip64 extensions, there are no alignment guarantees, and variable-length
//   extra fields make canonical bytes impossible. We keep the zip *shape* (directory + members)
//   with none of its encoding.
// - Content id = storage target (0 = inline, other = blob file) is the pivotal simplification. It
//   deleted the OUTLINE flag and the whole per-entry placement axis: where a section lives is a
//   property of its content, stated once in the mapping. Blob files being opaque means serving them
//   is `sendfile` of an immutable artifact, and describing them stays the container's job.
// - Section ids are store-unique rather than content-scoped so an entry is self-identifying; the
//   mapping adds *where*, entries say *what*. Applications address sections directly and group them
//   via their own DOCUMENT metadata.
// - The mapping lives in preamble extensions (segments 1..=N) rather than in per-segment ownership
//   headers or a data-region index: it is the single source of grouping truth, it is CRC-framed
//   like everything else in the header region, and prefix sums over it position every run and the
//   data region with no scanning. N is fixed at creation precisely so that growth never shifts what
//   follows; the trailing vacant record is how spare directory capacity is provisioned and claimed
//   without moving bytes.
// - Appends touch exactly: new payload bytes, the new run's segments, one extension segment. The
//   preamble itself is written twice in a container's life (creation, seal), which keeps the root
//   of trust out of every append's write path. A torn extension write is detected by its checksum
//   and loses only the mapping tail it carried; re-appending restores it.
// - Entries are 128 bytes (two cache lines): dropping the per-entry content id (the segment run
//   owns it) paid for a 96-byte metadata tail, so scalar arrays carry shape[8] and future section
//   types have room without a relayout. 31 entries tile a segment; the vacant sentinel sorting last
//   makes per-segment occupancy counts unnecessary.
// - MUST_UNDERSTAND is gone because ValidationRequired subsumes it: an unknown section type cannot
//   be validated, so demanding validation demands understanding. Volatile picks the failure
//   response (drop vs reject), giving four meaningful combinations. Volatile exists for delta/live
//   data whose loss is recoverable by re-ingestion (SPEC section 4); "expendable" was the naming
//   runner-up.
// - Vacant sentinels are all-ones at every granularity, not zero: a torn write can leave a
//   plausible zero-prefixed image, while all-ones reads as "erased, never written"; zero is the
//   inline content id; and all-ones sorts after every real key, so trailing vacancy is compatible
//   with sorted prefixes and binary search.
// - Content ids are deliberately not payload hashes. Marrying id to hash fixes the directory to one
//   hash algorithm forever, prevents assigning ids before content is final, and would force
//   revisions to keep their file name (hostile to cache-forever serving). UUIDv7 assignment is
//   recommended: uniqueness keeps derived blob file names collision-free across generations, and
//   monotonicity makes mapping order coincide with id order, upgrading content lookup from scan to
//   binary search for free.
// - CRC-64/NVME everywhere because `integrity::Checksum` already frames artifacts with it via
//   carryless-multiplication SIMD kernels; one algorithm keeps writers and fsck simple. Payload
//   checksums cover inline and blob-file bytes alike, so a store verifies end-to-end without
//   parsing JSON. Strong hashing is an application concern: a CRC guards against corruption, not
//   collision.
// - The ll layer pins magic and version through single-variant TryFromBytes enums, so "parsed but
//   wrong format" is unrepresentable; flags and counters stay FromBytes because undefined bits must
//   remain representable for readers to reject (or a future version to define). Validated types
//   with Option-returning constructors sit above; container-wide rules (prefix sums, sorted runs,
//   alignment, gap zeroing) belong to the codec above those.
// - The quad-tree/point-cloud split is the blob-file mechanism doing its job: per-node clouds as
//   separate replaceable files was the requirement, and inline storage gives the single-file
//   variant of the same layout with no extra format surface.
// - 4096-byte inline section alignment makes every inline section start page-aligned in the
//   mapping, so typed slices are aligned for any scalar and SIMD width and the kernel can fault
//   pages per section.
// - Scalar types include i16 (SPEC 3.8 delta encoding) and f16/bf16 (embedding payloads) even
//   though f32 is the working precision; the format outlives today's precision policy.
// - Rejected: a preamble replica at end-of-file for recovery (published stores are immutable and
//   atomically renamed; recovery is re-publish), inline string labels (fixed fields keep entries
//   canonical; naming is application metadata), and per-segment ownership headers (redundant with
//   the mapping; two sources of grouping truth invite disagreement).
// - Out of scope, deliberately: garbage collection of unreferenced blob files, and application
//   metadata schemas (the atlas stores its generation manifest as a DOCUMENT section under ids of
//   its choosing).
//
// Open questions:
//
// - Whether re-vacated payload holes need accounting (a free-space summary in the preamble?) or
//   whether compaction pressure stays operational knowledge. Per-node pointmap updates make holes
//   routine.
// - Sizing guidance for N and spare capacity at creation (one extension segment maps 170 contents,
//   which dwarfs a generation's artifact count; deltas may want more).
// - `.quad` payload: node table layout, Morton ordering, bucket cascade, i16 delta encoding (SPEC
//   3.8/3.9), and the point-cloud encoding. Candidate tree preamble fields: point count u64, node
//   count u64, root bounds f32x4, quantization step.
// - Compression: none in version 1 (mmap is the point). If ever added, it is a per-entry flag plus
//   a declared codec, never a container-wide mode.

pub(crate) mod ll;

#[cfg(test)]
mod tests;
