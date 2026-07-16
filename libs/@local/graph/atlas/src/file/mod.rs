//! On-disk file formats for atlas artifacts.
//!
//! Two formats are defined: `.salt`, a container for any binary artifact the
//! atlas persists, and `.quad`, a salt quadtree. Everything below is
//! normative for `.salt` layout version 1. All multi-byte integers are
//! little-endian, all offsets and lengths are in bytes, and all text is ASCII
//! unless stated otherwise.
//!
//! # The salt store
//!
//! A salt store is a directory holding one `.salt` container plus zero or
//! more outline blob files named by their content id:
//!
//! ```text
//! atlas.salt                              the container: header, directory,
//!                                         inline data
//! 0000000000000000000000000000002a.blob   outline blob (raw bytes)
//! 0000000000000000000000000000002b.quad   outline quad-tree blob
//! 0000000000000000000000000000002c.points outline point-cloud blob
//! ```
//!
//! The container is the single root of trust. Every stored byte stream is a
//! blob identified by a content id, and the directory records where each
//! blob's bytes live, how they are typed, and their checksums. What a blob
//! *means* (its role in a generation, its strong audit hash) is application
//! metadata; applications store it in a [`SECTION_TYPE_DOCUMENT`] blob of
//! their own. Reclaiming outline files that no container references
//! (garbage collection) is likewise out of scope for this format.
//!
//! A container is either *unsealed* or *sealed*. An unsealed container is a
//! work in progress: directory capacity is provisioned up front and blobs
//! are appended incrementally. Sealing finalizes the container; a sealed
//! container is immutable, and published generations are always sealed.
//!
//! # `.salt` container layout
//!
//! ```text
//! segment 0           fixed header
//! segments 1..=D      directory (D = directory segment count)
//! data region         inline section payloads, starting at 4096 * (1 + D)
//! ```
//!
//! The header region (segment 0 and the directory) operates in segments of
//! [`SEGMENT_BYTES`] (4096) bytes. A segment carries 4088 payload bytes
//! followed by a CRC-64 over exactly those 4088 bytes in its final 8 bytes.
//! Every checksum in this format is CRC-64/XZ (polynomial
//! `0x42F0E1EBA9EA3693` reflected, initial value and final xor all-ones,
//! check value `0x995DC9BBDF1939FA` for `"123456789"`). In an unsealed
//! container the directory-segment checksum trailers are zero; sealing
//! writes them. The data region is not segment-framed: each section payload
//! is covered by the checksum in its directory entry, and its layout only by
//! the alignment rules below.
//!
//! ## Segment 0: fixed header
//!
//! Segment 0 begins with the [`WireSaltHeader`] fields:
//!
//! | offset | size | field                                                        |
//! |--------|------|--------------------------------------------------------------|
//! | 0      | 4    | magic `SALT`                                                 |
//! | 4      | 4    | layout version, `u32` = 1                                    |
//! | 8      | 4    | header flags, `u32`                                          |
//! | 12     | 4    | directory segment count `D`, `u32`, at least 1               |
//! | 16     | 8    | occupied entry count, `u64`; zero while unsealed             |
//! | 24     | 8    | total container length, `u64`; zero while unsealed           |
//! | 32     | 4056 | reserved, must be zero                                       |
//! | 4088   | 8    | segment CRC-64/XZ over bytes 0..4088                         |
//!
//! Header flags:
//!
//! | bit | name                    | meaning                                    |
//! |-----|-------------------------|--------------------------------------------|
//! | 0   | [`HEADER_FLAG_SEALED`]  | the container is sealed                    |
//!
//! All other flag bits must be zero. The segment 0 checksum is valid in both
//! states; it is rewritten when the container is sealed. `D` is fixed when
//! the container is created and provisions the directory's whole capacity of
//! `D * 31` entry slots. In a sealed container the entry count equals the
//! number of occupied slots and the total length equals the exact file
//! length, which lets a reader detect truncation before touching any
//! payload.
//!
//! ## Directory segments
//!
//! Each directory segment holds 31 entry slots of [`ENTRY_BYTES`] (128)
//! bytes at offsets 0..3968, then 120 reserved zero bytes, then the segment
//! checksum trailer. A slot is *vacant* when its content id is
//! [`VACANT_CONTENT_ID`] (`u128::MAX`); a vacant slot has every byte after
//! the content id zero. Slots are vacant when the container is created and
//! become occupied one at a time as blobs are appended.
//!
//! Each occupied slot is a [`WireSaltEntry`]:
//!
//! | offset | size | field                                                    |
//! |--------|------|----------------------------------------------------------|
//! | 0      | 16   | content id, `u128`                                       |
//! | 16     | 4    | section id, `u32`                                        |
//! | 20     | 2    | section type, `u16`, nonzero                             |
//! | 22     | 2    | entry flags, `u16`                                       |
//! | 24     | 8    | start offset, `u64`                                      |
//! | 32     | 8    | end offset, `u64`, exclusive; `start < end`              |
//! | 40     | 8    | payload CRC-64/XZ over the section payload               |
//! | 48     | 80   | section metadata; layout is defined by the section type  |
//!
//! Metadata bytes beyond what the section type defines must be zero, and
//! section types that define no metadata require all 80 bytes zero.
//!
//! Section types (values above `0x00FF` are reserved):
//!
//! | value    | name                          | payload                          |
//! |----------|-------------------------------|----------------------------------|
//! | `0x0001` | [`SECTION_TYPE_DOCUMENT`]     | a UTF-8 JSON document            |
//! | `0x0002` | [`SECTION_TYPE_OPAQUE`]       | uninterpreted bytes              |
//! | `0x0003` | [`SECTION_TYPE_SCALAR_ARRAY`] | a scalar array typed by its      |
//! |          |                               | entry metadata                   |
//! | `0x0004` | [`SECTION_TYPE_INDEX`]        | the blob lookup index            |
//! | `0x0005` | [`SECTION_TYPE_QUAD_TREE`]    | `.quad` quadtree topology        |
//! | `0x0006` | [`SECTION_TYPE_POINT_CLOUD`]  | point-cloud data for one         |
//! |          |                               | quadtree node                    |
//!
//! A section type value fixes its metadata layout forever; changing a
//! metadata layout requires a new section type value.
//!
//! Entry flags:
//!
//! | bit | name                           | meaning                             |
//! |-----|--------------------------------|-------------------------------------|
//! | 0   | [`ENTRY_FLAG_OUTLINE`]         | the payload lives in the blob's     |
//! |     |                                | outline file                        |
//! | 1   | [`ENTRY_FLAG_MUST_UNDERSTAND`] | readers reject the container when   |
//! |     |                                | the section type is unknown to      |
//! |     |                                | them; otherwise unknown types are   |
//! |     |                                | skipped                             |
//!
//! All other flag bits must be zero.
//!
//! ## Scalar array metadata
//!
//! A [`SECTION_TYPE_SCALAR_ARRAY`] entry types its payload through
//! [`WireScalarArrayMetadata`] at metadata offset 0:
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
//! The product of the first `rank` dimensions times the scalar width equals
//! the section length `end - start`. No dimension is zero.
//!
//! ## Content ids
//!
//! A content id is a writer-assigned 128-bit identifier, unique per blob
//! within one container. Zero is reserved for container-owned structures
//! (currently the index) and `u128::MAX` for vacant slots; writers assign
//! any other value (sequential, random, truncated hashes - the format only
//! requires uniqueness). The format does not derive ids from payload bytes
//! and attaches no meaning to id values; what an id refers to is
//! application knowledge.
//!
//! The logical bytes of a blob are the concatenation of its section payloads
//! in section id order.
//!
//! ## Directory occupancy and ordering
//!
//! Occupancy is per slot. The pair `(content id, section id)` is unique
//! among occupied slots. The occupied slots of one blob are consecutive
//! slots in ascending section id order, with no vacant slot inside the run:
//! a blob is appended as one unit. Beyond that, blob runs may appear in any
//! slot order and vacant slots may appear between runs; lookup uses the
//! index when present and a linear scan otherwise.
//!
//! Slot 0 is reserved for the optional index (content id zero, section id
//! 0). It stays vacant while the container is unsealed and is filled at
//! sealing when an index is emitted. Blob runs occupy slots 1 onward.
//!
//! Reserved fields, metadata padding, vacant slot bytes, and alignment gaps
//! are zero (after the vacant sentinel itself). A sealed container is
//! byte-determined by its directory order and payloads: writers that append
//! blobs in a defined order produce identical files. The format records no
//! timestamps for the same reason.
//!
//! ## Inline and outline storage
//!
//! Every entry of one blob carries the same [`ENTRY_FLAG_OUTLINE`] state: a
//! blob is stored wholly inline or wholly outline.
//!
//! Inline section offsets index into the container itself. Each inline
//! payload starts at the next [`SECTION_ALIGNMENT`] (4096) boundary at or
//! after the end of the previously appended payload, so appending never
//! moves existing bytes and every section start is page-aligned for mapping
//! and SIMD access. Inline ranges do not overlap and gap bytes are zero.
//! Alignment gaps belong to no section and are excluded from logical bytes.
//! In a sealed container the total length equals the end offset of the last
//! inline section, or `4096 * (1 + D)` when every blob is outline.
//!
//! Outline section offsets index into the blob's outline file, and the
//! blob's sections tile that file exactly: the first section starts at 0,
//! consecutive sections are contiguous, and the last section ends at the
//! file length. An outline file therefore contains exactly the blob's
//! logical bytes. Its name is derived, never stored: the content id as 32
//! lowercase hexadecimal characters, followed by an extension chosen by the
//! type of the blob's lowest section id - `quad` for
//! [`SECTION_TYPE_QUAD_TREE`], `points` for [`SECTION_TYPE_POINT_CLOUD`],
//! and `blob` otherwise. No alignment is imposed inside outline files; a
//! blob format that wants aligned interior sections declares explicit
//! [`SECTION_TYPE_OPAQUE`] padding sections, which are part of its logical
//! bytes.
//!
//! ## The index
//!
//! The index accelerates content id lookup in large directories. It is
//! optional, lives at slot 0 as content id zero with type
//! [`SECTION_TYPE_INDEX`], and its payload is an array of 24-byte
//! [`WireIndexRecord`] values sorted by ascending content id:
//!
//! | offset | size | field                                       |
//! |--------|------|---------------------------------------------|
//! | 0      | 16   | content id, `u128`                          |
//! | 16     | 4    | first directory slot of the blob, `u32`     |
//! | 20     | 4    | slot count of the blob, `u32`, nonzero      |
//!
//! The index covers exactly the occupied blob runs from slot 1 onward. A
//! reader resolves a content id by binary search, then reads the run of
//! entries it names. The index entry is inline, has section id 0, zero
//! metadata, and carries no flags: the index is derivable from the
//! directory, so it is never mandatory to understand.
//!
//! ## Sealing
//!
//! Sealing makes an unsealed container immutable, in order: optionally
//! build the index, append its payload, and fill slot 0; write every
//! directory-segment checksum; rewrite segment 0 with the occupied entry
//! count, the total length, the [`HEADER_FLAG_SEALED`] flag, and its
//! checksum. Publication then renames the sealed container into place
//! atomically.
//!
//! Sealing preserves the directory verbatim: slots are not reordered and
//! vacant slots are not dropped. Compaction is a separate, explicit rewrite
//! into a fresh container; no operation in this format performs it
//! implicitly.
//!
//! ## Integrity
//!
//! Integrity forms a chain from the fixed header outward. In a sealed
//! container the segment checksums authenticate the header and every
//! directory slot, and each entry's payload checksum authenticates its
//! section bytes, wherever they live. Checksums detect corruption and torn
//! writes; they are not collision-resistant, so applications that need
//! content identity or tamper evidence record strong hashes in their own
//! metadata.
//!
//! In an unsealed container the directory-segment trailers are zero, and an
//! entry is trusted only after its own bytes prove out: a slot counts as
//! occupied when its content id is not the vacant sentinel, it is
//! structurally valid, and its payload checksum verifies. A slot torn
//! mid-write fails that test and reads as garbage to be overwritten, so a
//! crash during an append loses at most the entry being written.
//!
//! ## Reader obligations
//!
//! A reader accepts a sealed container only after checking, in order: the
//! magic, version, and flags; the fixed-header checksum; that the total
//! length equals the file length; every directory-segment checksum; and
//! every structural rule above (occupancy, uniqueness, run contiguity,
//! bounds, alignment, flag agreement, metadata validity, zero padding,
//! index sortedness and coverage when present). Readers verify a section's
//! payload checksum before exposing its bytes. Payload checksums may be
//! verified lazily on first access, and must all be verified by any tool
//! that reports a store as intact. Unknown section types are skipped unless
//! flagged [`ENTRY_FLAG_MUST_UNDERSTAND`]; unknown versions and nonzero
//! reserved fields are rejected.
//!
//! Unsealed containers are read only by their writer and by recovery
//! tooling, under the per-entry trust rule above.
//!
//! ## Limits
//!
//! Version 1 caps the directory at [`MAX_DIRECTORY_SEGMENTS`] (16384)
//! segments, which is 64 MiB of directory and 507904 entry slots. Capacity
//! is fixed when the container is created. Offsets, lengths, and entry
//! counts are `u64`; section ids are `u32`; array rank is at most 8.
//!
//! # `.quad` quadtrees
//!
//! A salt quadtree pointmap is two kinds of blob: one *quad-tree* blob
//! holding the topology (node table, bounds, and the content ids of the
//! point clouds its nodes reference) and one *point-cloud* blob per node
//! holding that node's points. Splitting them makes updates local: adding
//! or removing a node writes the affected point-cloud blobs and one new
//! tree blob, and touches nothing else.
//!
//! Both kinds store like any other blob. Outline, each point cloud is its
//! own derived-name file that can be served directly and replaced
//! independently; inline, a whole pointmap travels in a single `.salt`
//! file. Revised content is appended under a fresh content id and the tree
//! re-pointed - payload bytes are never mutated in place, so served files
//! stay cacheable forever.
//!
//! A standalone `.quad` file carries a quad-tree blob's logical bytes. Its
//! first 4096 bytes are a header segment with the same checksum framing as
//! the `.salt` header region, beginning with magic `QUAD` and a `u32`
//! layout version. The tree payload (node table, Morton ordering, bucket
//! cascade) and the point-cloud encoding are not yet specified; the version
//! stays 0 and both are unstable until they are.
//!
//! # Implementation layers
//!
//! [`wire`] fixes the raw images: sizes, field order, endianness, and
//! nothing else - every bit pattern is representable there. [`header`],
//! [`section`], and [`entry`] wrap them in validated types whose
//! constructors enforce the structural rules stated above, so holding a
//! typed value is proof that its wire image is well-formed. Writers compose
//! typed values and encode them; readers decode wire images and receive a
//! typed value or a rejection, never an unchecked intermediate.
//!
//! [`SEGMENT_BYTES`]: wire::SEGMENT_BYTES
//! [`WireSaltHeader`]: wire::WireSaltHeader
//! [`HEADER_FLAG_SEALED`]: wire::HEADER_FLAG_SEALED
//! [`ENTRY_BYTES`]: wire::ENTRY_BYTES
//! [`VACANT_CONTENT_ID`]: wire::VACANT_CONTENT_ID
//! [`WireSaltEntry`]: wire::WireSaltEntry
//! [`SECTION_TYPE_DOCUMENT`]: wire::SECTION_TYPE_DOCUMENT
//! [`SECTION_TYPE_OPAQUE`]: wire::SECTION_TYPE_OPAQUE
//! [`SECTION_TYPE_SCALAR_ARRAY`]: wire::SECTION_TYPE_SCALAR_ARRAY
//! [`SECTION_TYPE_INDEX`]: wire::SECTION_TYPE_INDEX
//! [`SECTION_TYPE_QUAD_TREE`]: wire::SECTION_TYPE_QUAD_TREE
//! [`SECTION_TYPE_POINT_CLOUD`]: wire::SECTION_TYPE_POINT_CLOUD
//! [`ENTRY_FLAG_OUTLINE`]: wire::ENTRY_FLAG_OUTLINE
//! [`ENTRY_FLAG_MUST_UNDERSTAND`]: wire::ENTRY_FLAG_MUST_UNDERSTAND
//! [`WireScalarArrayMetadata`]: wire::WireScalarArrayMetadata
//! [`SECTION_ALIGNMENT`]: wire::SECTION_ALIGNMENT
//! [`WireIndexRecord`]: wire::WireIndexRecord
//! [`MAX_DIRECTORY_SEGMENTS`]: wire::MAX_DIRECTORY_SEGMENTS

// Design notes (rationale, not contract):
//
// - Replaces `salt::storage::mmap` (`SALTMMAP`). That format is one artifact per file with an
//   internal section table; blob identity, dedupe, and cross-file consistency all live outside the
//   format in JSON manifests. Here the container itself is the unit of consistency: one directory
//   and a single small file to rename for an atomic publish.
// - Prior art the layout leans on: ELF section headers (fixed-size entries whose fields are
//   reinterpreted by section type - our 128-byte entry with a typed metadata tail is the same
//   move), safetensors/GGUF/Arrow (typed dtype+shape metadata in a header, aligned raw buffers
//   behind it), PNG (per-chunk CRC and the critical-chunk bit, mirrored by the per-entry payload
//   CRC and MUST_UNDERSTAND flag), OCI image layout (id-named blobs stored beside an index,
//   mirrored by outline files), and flash/FAT-style erased-slot sentinels (all-ones = never
//   written, mirrored by the vacant content id).
// - Not zip: zip's central directory sits at end-of-file (must read the tail first, hostile to
//   validate-then-mmap), CRC-32 is weak, offsets need zip64 extensions, there are no alignment
//   guarantees, and the variable-length extra-field zoo makes canonical bytes impossible. We keep
//   the zip *shape* (directory + addressable members) with none of its encoding. The typed metadata
//   tail is fixed-width for the same reason zip's TLV extra fields are rejected: one valid image
//   per logical content.
// - The mandatory manifest died once the directory became self-describing. Its original jobs went
//   elsewhere: typing into entry metadata, integrity into per-entry CRCs, lookup into the index,
//   outline names into derivation from the content id. What remained (roles, generations, strong
//   hashes) is application semantics that the atlas generation manifest (SPEC appendix A) already
//   owns; mandating a JSON member at the format level bought a parse step and a seal dependency for
//   nothing. DOCUMENT survives as a type so tooling can recognize embedded JSON.
// - Derived outline names (hex id + type-determined extension) keep the store scrutable without any
//   metadata lookup: fsck can enumerate, verify, and orphan-check files from the directory alone.
//   Friendly names are an application concern.
// - The vacant sentinel is u128::MAX, not zero, for three reasons. First, the old "all-zero slot =
//   unused" test is unsafe under in-place fills: a torn 128-byte write can leave a plausible
//   zero-prefixed entry, while all-ones reads as "erased, never written". Second, zero is already
//   the container-owned id. Third, if a future version wants sorted directories, MAX sorts after
//   every real id, so trailing vacancy is order-compatible.
// - Provisioned capacity (fixed D, vacant slots) exists for SPEC section 4: minor ingestion between
//   generations appends delta blobs without rewriting anything. A writer provisions, say, 64
//   segments (256 KiB of directory, 1984 slots), appends payloads at the 4096-aligned tail, and
//   flips slots in. Growing capacity would shift the data region, so it is deliberately impossible;
//   compaction into a fresh container is the escape hatch.
// - The sealed flag exists because segment checksums and incremental fills are incompatible: every
//   128-byte fill would rewrite its segment's trailer, and a torn 4096-byte segment write would
//   take out 30 sibling entries. Unsealed containers therefore leave trailers zero and lean on the
//   per-entry payload CRC (which doubles as the occupancy validator); sealing freezes the directory
//   and buys back whole-segment integrity. The cost is honest: an unsealed directory's slot bytes
//   are only as trustworthy as each entry proves itself.
// - Canonical bytes are now conditional: a sealed image is determined by directory order and
//   payloads, so reproducibility requires writers to append in a defined order (the generation
//   pipeline does). Global sorted order was traded away for append-in-place; the index restores
//   fast lookup where sortedness used to.
// - Compaction is never automatic. Sealing keeps slots verbatim; a compacting rewrite into a fresh
//   container is permitted but rarely worth it: a vacant slot costs 128 bytes, so even a fully
//   provisioned 64-segment directory strands at most a few hundred KiB against multi-GiB payloads.
//   The realistic trigger is stranded *payload* holes after re-vacating slots, not directory waste.
// - The index is a section rather than a header structure so it inherits every existing mechanism
//   (typing, payload CRC, offsets) for free and stays optional. 24-byte records times half a
//   million entries is 12 MiB at the absolute cap; typical directories fit in one page.
// - Content ids are deliberately not payload hashes. Marrying id to hash fixes the directory to one
//   hash algorithm forever, prevents assigning ids before content is final during a streaming
//   write, and would force in-place revisions to keep their file name (hostile to cache-forever
//   serving). Applications that want content addressing can still assign truncated hashes as ids.
// - Entries grew from 48 to 128 bytes to host the typed metadata tail. The payoff: a reader types
//   every scalar array (dtype, rank, shape) straight from the directory with zero JSON on the load
//   path, and fsck can validate shapes against lengths without any application metadata. 128 is two
//   cache lines, keeps every field naturally aligned, and 31 entries tile a 4088-byte segment
//   payload (120 bytes spare). The directory keeps what is mechanical (where, what type, what
//   shape); applications keep what is semantic (names, roles, strong hashes).
// - The per-entry payload CRC closes the integrity gap left by the unframed data region and covers
//   outline files too, so a store can be checked end-to-end without parsing JSON. Strong hashing is
//   an application concern: a CRC guards against corruption, not collision.
// - The quad-tree/point-cloud split is the outline mechanism doing its job: per-node clouds as
//   separate replaceable files was the requirement, and inline storage gives the single-file
//   variant of the same layout with no extra format surface. The tree blob stays small, so
//   rewriting it per update is cheap; clouds never reflow because each lives in its own file (or
//   its own aligned inline section).
// - `section index` (fragmented sections) is gone. Multiple arrays of one type within a blob are
//   distinct section ids; fragmentation would break zero-copy typed views (a slice cannot span
//   fragments) and 64-bit offsets leave no size pressure.
// - CRC-64/XZ everywhere because one algorithm keeps writers and fsck simple, and it is cheap and
//   hardware-accelerated (the `crc64fast` crate provides a SIMD implementation).
// - 4096-byte section alignment makes every inline section start page-aligned in the mapping, so
//   typed slices over section payloads are aligned for any scalar and SIMD width and the kernel can
//   fault pages per section.
// - Scalar types include i16 (SPEC 3.8 delta encoding) and f16/bf16 (embedding payloads) even
//   though f32 is the working precision; the format outlives today's precision policy.
// - Rejected: a header replica at end-of-file for recovery (published stores are immutable and
//   atomically renamed; recovery is re-publish), and inline string labels in entries (fixed fields
//   keep entries canonical; naming is application metadata).
// - Out of scope, deliberately: garbage collection of unreferenced outline files (an operational
//   concern above the format), and application metadata schemas (the atlas stores its generation
//   manifest as a DOCUMENT blob under an id of its choosing).
//
// Open questions:
//
// - Whether an unsealed container needs a deletion story (re-vacating a slot leaves an unreachable
//   payload hole until compaction). Per-node pointmap updates make this more likely to matter.
// - `.quad` payload: node table layout, Morton ordering, bucket cascade, i16 delta encoding (SPEC
//   3.8/3.9), and the point-cloud encoding. Candidate tree header fields: point count u64, node
//   count u64, root bounds f32x4, quantization step.
// - Compression: none in version 1 (mmap is the point). If ever added, it is a per-entry flag plus
//   a declared codec, never a container-wide mode.
//
// The two-layer split (wire vs typed) exists because raw type codes and metadata bytes are
// free-form abuse surface: nothing stops a hand-built entry from pairing SCALAR_ARRAY with zeroed
// metadata or claiming INDEX under a blob id. The typed layer makes those states unrepresentable
// (SectionKind carries its metadata; the index is not a SectionKind at all) and funnels every
// remaining rule through Option-returning constructors.

pub(crate) mod entry;
pub(crate) mod header;
pub(crate) mod section;
pub(crate) mod wire;

#[cfg(test)]
mod tests;
