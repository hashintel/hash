//! On-disk storage for atlas artifacts.
//!
//! Artifacts are plain files in a directory, one artifact per file,
//! described by metadata stored beside them. There is no container
//! format: the filesystem is the container. A generation is published by
//! writing every file to a temporary directory, syncing, and renaming it
//! into place, so it is either absent or complete; published files are
//! immutable and may be cached forever.
//!
//! - [`array`](mod@array) is the raw scalar array file: a self-describing 4096-byte header followed
//!   by the packed elements, so a whole-file mapping yields page-aligned data.
//! - [`attraction`] is the attraction index file: relation group records delimiting ranges of one
//!   flat edge-record array, both page-aligned regions of one file.
//! - [`morton`] is the combined-file archetype: a page index in front of the sorted code array it
//!   indexes, both page-aligned.
//! - [`identity`] is the identity file: a row-ordered id column and its sorted `(id, row)` lookup
//!   pairs behind an index prelude, page-aligned regions of one file, so rows translate to source
//!   identities and back without decoding.
//! - [`landmark`] is the landmark skeleton file: selected rows, the corpus assignment, and the
//!   layout coordinates - three ordinal-keyed regions of one file, page-aligned.
//! - [`classifier`] is the classifier file: the fitted relation-policy model - coefficient rows,
//!   applicability moments, and training distances as page-aligned regions of one file, the scalar
//!   parameters in the header.
//! - [`policy`] is the policy file: the resolved geometry policy table, one fixed-width record per
//!   relation type, ascending by relation.
//! - [`postings`] is the postings file: per-type membership over the base delivery order - sorted
//!   position lists or dense bitmaps, flagged per type - beside the type graph's direct parent
//!   edges, page-aligned regions of one file.
//! - [`sprs`](mod@sprs) is the sparse matrix file: one compressed-sparse-row matrix - row pointers,
//!   column indices, values - as page-aligned regions of one file, written from and reopened as
//!   [`sprs::CsMatBase`](::sprs::CsMatBase) views.
//! - [`quad`] is quadtree topology: the bucket-cut tile tree - node table, own-bucket runs into the
//!   base delivery order, and per-node direct-type sets as page-aligned regions of one file.
//! - [`repository`] names published files and binds each to a strong hash.
//! - [`salt`] is the SALT generation repository: the files one published generation consists of and
//!   the metadata describing them.
//! - [`generation`] is the directory layer around them: staging, the atomic publish, and the
//!   current-generation pointer.
//!
//! Integrity is layered by cost. Array headers validate by parsing (the
//! magic and version are pinned, so foreign bytes fail to parse), the one
//! structural rule is the file length equation, torn writes are prevented
//! by the temporary-path-and-rename publish, and corruption detection is
//! the SHA-256 each repository file records, verified by tooling rather
//! than on every load.
//!
//! Every format here is at layout version 0 and **mutable**: change any
//! layout freely to fit what the pipeline needs and increment its version
//! when you do. Pinned parses rejecting other versions is the intended
//! failure mode; no migration or compatibility machinery exists on
//! purpose until a format stabilizes. This applies to the binary headers
//! and to the metadata document's schema alike.
//!
//! # Format palette
//!
//! Each artifact uses the weakest format its access pattern permits, in
//! this preference order:
//!
//! 1. **Raw array file** ([`array`](mod@array)): flat numeric data on the serving or training hot
//!    path, where access is a page-aligned zero-copy mapping and decode cost is unacceptable.
//!    Structured records flatten into one file per column (struct of arrays) before they justify
//!    anything richer.
//! 2. **Specialized zerocopy file**: structured binary that a mapping must expose without decoding
//!    but that is not a flat array. Built like the array header: a pinned 4096-byte preamble,
//!    explicit little-endian layout, parse-is-validation.
//! 3. **Parquet**: genuinely tabular data with heterogeneous columns, read once into memory or
//!    queried analytically, never mapped. Buys compression and external tooling (`DuckDB`,
//!    `polars`) at the cost of decode and the arrow dependency tree.
//! 4. **rkyv**: only for pointer-rich structures where laying out an explicit zerocopy format is
//!    unreasonable. None currently qualify; zerocopy is preferred wherever a layout can be written
//!    down.
//! 5. **JSON**: the metadata document alone - small, read once, and inspected by humans more often
//!    than machines.
//!
//! Formats owned by frameworks (the burn checkpoint) stay as the
//! framework writes them.
//!
//! Parts combine into one file when they are derived from one another,
//! meaningless apart, and always read together - a lookup index in front
//! of the array it indexes is the canonical case. A combined file is a
//! specialized zerocopy file whose pinned header names each region
//! statically, and every array region starts on a 4096-byte boundary
//! (zero-padded up to it), so the whole-file-mapping alignment guarantee
//! is unchanged. Parts that version or get replaced independently stay
//! separate files.
//!
//! # Artifacts
//!
//! What each published artifact needs, and the format that follows:
//!
//! | artifact                        | needs                                        | format |
//! |---------------------------------|----------------------------------------------|--------|
//! | embeddings, representations     | mmap + SIMD scans (`f32[N, D]`)              | array  |
//! | canonical coordinates           | mmap, serving hot path (`f32[N, 2]`)         | array  |
//! | morton codes                    | mmap + binary search (`u64[N]`,              | combined |
//! |                                 | bucket-major); bucket fenceposts and an      |        |
//! |                                 | index prelude make lookups page-fault-cheap  |        |
//! |                                 | and segment-safe                             |        |
//! | importance ranks, permutations  | mmap, tile assembly (`u32` arrays)           | array  |
//! | semantic graph adjacency        | training reads, audits; a CSR matrix over    | sprs   |
//! |                                 | the row domain, its three columns never read |        |
//! |                                 | apart                                        |        |
//! | attraction index                | training sampling; group records delimiting  | combined |
//! |                                 | a flat edge array, never read apart          |        |
//! | edge endpoints                  | mmap, edge-row lookups (`u64[E, 2]`)         | array  |
//! | incident adjacency              | mmap, serving lookups; a structure-only CSR  | sprs   |
//! |                                 | over paired per-node runs, edge ids as       |        |
//! |                                 | indices, unit values                         |        |
//! | landmark skeleton (`.lndm`)     | selection, assignment, and layout sharing    | combined |
//! |                                 | one ordinal vocabulary, never read apart     |        |
//! | analytic raster                 | mmap (`f32` grid)                            | array  |
//! | merge tree                      | small, structured; flattens to parent/birth/ | array  |
//! |                                 | death columns                                |        |
//! | classifier (`.clsf`)            | one small model - coefficients, moments,     | combined |
//! |                                 | distances - fitted together, never read      |        |
//! |                                 | apart                                        |        |
//! | policy table (`.plcy`)          | resolved per-relation records, read whole    | zerocopy |
//! |                                 | and searched by relation                     |        |
//! | quadtree topology (`.quad`)     | mmap, tile traversal; node table, own-bucket | combined |
//! |                                 | runs into the base order, and per-node       |        |
//! |                                 | direct-type sets, never read apart           |        |
//! | type postings (`.post`)         | mmap, filter/coloring lookups; per-type      | combined |
//! |                                 | membership runs and the parent edges the     |        |
//! |                                 | closure derives from, one type domain,       |        |
//! |                                 | never read apart                             |        |
//! | node/edge identities (`.idnt`)  | mmap, serving lookups both ways: `row -> id` | combined |
//! |                                 | by indexing the id column, `id -> row` by    |        |
//! |                                 | binary search over sorted pairs behind an    |        |
//! |                                 | index prelude                                |        |
//! | relation edges                  | wide table (endpoints, class, probability,   | parquet |
//! |                                 | strength), read once, analysed               |        |
//! | projector checkpoint            | burn training restore                        | mpk    |
//! | generation metadata             | inputs, seeds, config, quality metrics, file | JSON   |
//! |                                 | names + hashes; the root of trust            |        |
//!
//! The parquet row is pending the dependency decision; until then it
//! stores as struct-of-arrays array files without losing anything but
//! external queryability.

// Design notes (rationale, not contract):
//
// - A custom container format (content-addressed blobs, CRC-framed directory segments, sealed
//   states) was fully specified here and then rejected: nearly everything it provided -
//   page-aligned sections, crash-safe directory updates, atomic publish, provisioned append
//   capacity - restated guarantees the filesystem already makes (page-aligned mmap, journaled
//   metadata, rename atomicity, O_CREAT). Directories of dumb files are also what object storage
//   maps onto 1:1. Precedents: Zarr (raw chunk files + JSON metadata, designed as the reaction to
//   HDF5's monolithic container), numpy .npy (tiny header + raw buffer), OCI image layout, and git,
//   which started with loose object files and added packfiles only when millions of tiny files
//   measurably hurt. Revisit packing only if that materializes (candidate: quadtree point-cloud
//   files; bucket leaves to >= 64 KiB first).
// - No checksums inside the files: temp+rename handles torn writes, the repository hash handles
//   bitrot, and hashing at publish time is one streaming pass the pipeline already makes. CRC
//   framing existed to protect a container's own directory structure; without a container there is
//   nothing of ours to frame.
// - The array header is exactly 4096 bytes so that mapping a whole file leaves the data aligned for
//   every scalar and SIMD width on every supported page size (4 KiB x86_64, 16 KiB Apple Silicon,
//   64 KiB aarch64 distros - all multiples of 4096). The discipline that keeps this provable: map
//   whole files and slice at the header size, never mmap at a nonzero file offset (offsets must be
//   page-size multiples, which 4096 is not on 16 KiB pages).
// - Shapes need no validation because every bit pattern means something: the shape is the longest
//   nonzero dimension prefix, a leading zero is the empty array, and the only enforcement point is
//   total: expected file length, computed with checked arithmetic, where overflow simply matches no
//   real file.
// - The artifact table replaces the previous pipeline's 20-artifact requirement, of which 13 were
//   gate/evidence/provenance JSONs plus a numbered evidence store and an activation state machine.
//   The multi-section .salt artifacts unpack into their columns: base.salt (17 sections) and
//   analytics.salt (20) become a handful of array files each; relations.salt (30 sections) was a
//   table wearing a container costume and becomes one parquet/SoA artifact. What survives of the
//   report apparatus survives as *fields* of the metadata document - the reproducibility block
//   (input snapshot hashes, seeds, config hash) and the tracked quality metrics (trustworthiness,
//   k-NN preservation) that the de-oracle test plan depends on - not as files. Activation is a
//   single current-generation pointer above the versioned directories.
// - zerocopy over rkyv as the default for specialized files: an explicit #[repr(C)] layout with
//   pinned identity is inspectable in a hex dump, has no schema evolution machinery to fight, and
//   is already the house discipline. rkyv earns its place only when a structure is genuinely
//   pointer-rich (deep recursive graphs) - and the merge tree, the one candidate, flattens to three
//   columns instead.
// - parquet is a real dependency decision, not a default: the parquet crate pulls the arrow tree
//   into an otherwise lean crate. The two tabular artifacts work as struct-of-arrays without it;
//   what parquet buys is DuckDB/polars over a live atlas, which has real debugging value at a
//   million entities. Decide once, at adoption time.
// - Combined files are deliberately not a container relapse. The guardrails: regions are fields of
//   the kind's own pinned header (no generic directory, no section table, no N), the parts must be
//   derived from each other and read together (an index and its array are one artifact that would
//   otherwise carry a cross-file consistency invariant), and independently-replaceable parts stay
//   separate files (point clouds). The morton file is the archetype: a small key index in front
//   means a binary search faults the index page plus one data page instead of log2(N) scattered
//   pages, and the index can never be stale because it cannot exist apart from its array.

pub(crate) mod array;
pub(crate) mod attraction;
pub(crate) mod classifier;
pub(crate) mod generation;
pub(crate) mod identity;
pub(crate) mod landmark;
pub(crate) mod morton;
pub(crate) mod policy;
pub(crate) mod postings;
pub(crate) mod quad;
pub(crate) mod repository;
pub(crate) mod salt;
pub(crate) mod sprs;
