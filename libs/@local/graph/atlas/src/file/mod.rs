//! On-disk storage for atlas artifacts.
//!
//! Artifacts are plain files in a directory, one artifact per file, described by metadata stored
//! beside them. No container format exists: the filesystem is the container. Publishing a
//! generation writes every file to a temporary directory, syncs, and renames it into place, so a
//! generation is either absent or complete. Published files never change, so caching them forever
//! is safe.
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
//! - [`landmark`] is the landmark skeleton file, three ordinal-keyed and page-aligned regions of
//!   one file holding selected rows, the corpus assignment, and the layout coordinates.
//! - [`classifier`] is the classifier file: the fitted relation-policy model - coefficient rows,
//!   applicability moments, and training distances as page-aligned regions of one file, the scalar
//!   parameters in the header.
//! - [`policy`] is the policy file, the resolved geometry policy table with one fixed-width record
//!   per relation type, ascending by relation.
//! - [`postings`] is the postings file: per-type membership over the base delivery order - sorted
//!   position lists or dense bitmaps, flagged per type - beside the type graph's direct parent
//!   edges, page-aligned regions of one file.
//! - [`sprs`](mod@sprs) is the sparse matrix file: one compressed-sparse-row matrix - row pointers,
//!   column indices, values - as page-aligned regions of one file, written from and reopened as
//!   [`sprs::CsMatBase`](::sprs::CsMatBase) views.
//! - [`quad`] is quadtree topology: the bucket-cut tile tree - node table, own-bucket runs into the
//!   base delivery order, and per-node direct-type sets as page-aligned regions of one file.
//! - [`repository`] names published files and binds each to a strong hash.
//! - [`salt`] is the SALT generation repository, naming the files one published generation consists
//!   of and the metadata describing them.
//! - [`generation`] is the directory layer around them, with staging, the atomic publish, and the
//!   current-generation pointer.
//!
//! Integrity mechanisms layer by cost. Array headers validate by parsing, because the pinned magic
//! and version make foreign bytes fail to parse. The one structural rule is the file length
//! equation. The temporary-path-and-rename publish prevents torn writes, and the SHA-256 each
//! repository file records detects corruption. Tooling verifies that hash on demand, and no load
//! verifies it. No file carries an internal checksum. Hashing at publish is one streaming pass the
//! pipeline already makes, and the structure an internal checksum would protect is the directory,
//! which the filesystem holds.
//!
//! Shapes need no validation because every bit pattern means something. The shape is the longest
//! nonzero dimension prefix, and a leading zero is the empty array. The single enforcement point is
//! the total, the expected file length computed with checked arithmetic. An overflowing computation
//! matches no real file.
//!
//! Every format here is **mutable**. Change any layout to fit what the pipeline needs and increment
//! its version when you do. Pinned parses rejecting other versions is the intended failure mode. A
//! fresh generation replaces the files a layout change strands.
//!
//! Each binary header states its own layout version. The published JSON states one more
//! number. [`RepositoryVersion`](repository::RepositoryVersion) leads the serialized document and
//! versions the repository layout and the metadata schema together, with the schema nested inside
//! the document it leads.
//!
//! # The filesystem is the container
//!
//! A directory of plain files inherits what the filesystem already guarantees: page-aligned
//! mappings, journaled metadata, atomic rename, and exclusive creation - page-aligned sections,
//! crash-safe directory updates, atomic publish and provisioned append capacity, in a container
//! format's vocabulary. The same layout maps onto object storage one to one, and it is the shape
//! the array-plus-metadata families take: Zarr's raw chunk files beside JSON metadata, numpy's
//! small header in front of a raw buffer, the OCI image layout.
//!
//! Packing many small files into fewer large ones stays available for the day file count measurably
//! hurts. The candidate is the quadtree point clouds. Raise bucket leaves to at least 64 KiB first.
//!
//! # Whole-file mappings
//!
//! Every mapping covers a whole file and slices at the header size. An array header is exactly 4096
//! bytes, and every supported page size (4 KiB on `x86_64`, 16 KiB on Apple Silicon, 64 KiB on
//! `aarch64` distributions) is a multiple of that, so a page-aligned mapping base leaves the data
//! behind the header aligned for every scalar and SIMD width. Mapping from zero is what makes that
//! provable. The kernel accepts only page-size-multiple mmap offsets, and 4096 is not one on 16 KiB
//! pages.
//!
//! # Format palette
//!
//! Each artifact uses the weakest format its access pattern permits, in this preference order:
//!
//! 1. **Raw array file** ([`array`](mod@array)): flat numeric data on the serving or training hot
//!    path, where access is a page-aligned zero-copy mapping and decode cost is unacceptable.
//!    Structured records flatten into one file per column (struct of arrays) before they justify
//!    anything richer.
//! 2. **Specialized zerocopy file**: structured binary that a mapping must expose without decoding
//!    but that is not a flat array. Built like the array header: a pinned 4096-byte preamble,
//!    explicit little-endian layout, parse-is-validation.
//! 3. **Parquet**: tabular data with heterogeneous columns that a reader loads once into memory or
//!    queries analytically. A Parquet file is never mapped. It buys compression and external
//!    tooling (`DuckDB`, `polars`) over a live atlas - worth real debugging time at a million
//!    entities - at the cost of decode and the arrow dependency tree in an otherwise lean crate, so
//!    the choice happens once, at adoption.
//! 4. **rkyv**: pointer-rich structures alone, such as deep recursive graphs, where laying out an
//!    explicit zerocopy format is unreasonable. An explicit `#[repr(C)]` layout with pinned
//!    identity is inspectable in a hex dump and carries no schema-evolution machinery, so zerocopy
//!    is the choice wherever writing the layout down is possible. The merge tree, the one candidate
//!    here, flattens to three columns instead.
//! 5. **JSON**: the metadata document alone. It is small, read once, and inspected by humans more
//!    often than machines.
//!
//! Formats owned by frameworks (the burn checkpoint) stay as the framework writes them.
//!
//! # Combined files
//!
//! Parts combine into one file when they derive from one another and mean nothing apart, so a
//! read always takes them together. A lookup index in front of the array it indexes is the
//! canonical case. Parts that version or get replaced independently stay separate files.
//!
//! Layout, derivation, and alignment keep a combined file distinct from a container. Regions are
//! fields of the kind's own pinned header, so the format needs no generic directory, section table,
//! or region count. The parts derive from each other and read together, which is what makes them
//! one artifact rather than two carrying a cross-file consistency invariant. Every array region
//! starts on a 4096-byte boundary, zero-padded up to it, so the whole-file mapping guarantee above
//! holds unchanged.
//!
//! [`morton`] is the archetype. A small key index in front of the code array means a binary search
//! faults the index page plus one data page instead of log2(N) scattered pages, and the index
//! cannot go stale, because it cannot exist apart from the array it indexes.
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
//! |                                 | the row domain, its three columns reading    |        |
//! |                                 | as one                                       |        |
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
//! | node/edge identities (`.idnt`)  | mmap, serving lookups both ways: `row → id`  | combined |
//! |                                 | by indexing the id column, `id → row` by     |        |
//! |                                 | binary search over sorted pairs behind an    |        |
//! |                                 | index prelude                                |        |
//! | relation edges                  | wide table (endpoints, class, probability,   | parquet |
//! |                                 | strength), read once, analysed               |        |
//! | projector checkpoint            | burn training restore                        | mpk    |
//! | generation metadata             | inputs, seeds, config, quality metrics, file | JSON   |
//! |                                 | names + hashes; the root of trust            |        |
//!
//! The parquet row is pending the dependency decision; until then it stores as struct-of-arrays
//! array files without losing anything but external queryability.
//!
//! The metadata document's reproducibility block (input snapshot hashes, seeds, config hash) and
//! its quality metrics (trustworthiness, k-NN preservation) are report-shaped state carried as
//! fields rather than as files of their own. Activation is one current-generation pointer above the
//! versioned directories.

use std::io;

use crate::integrity::Sha256Digest;

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
pub(crate) mod region;
pub(crate) mod repository;
pub(crate) mod salt;
pub(crate) mod sprs;

/// A value that writes itself as one artifact stream and names the written bytes.
///
/// The digest is the SHA-256 of exactly the bytes written, in one pass - the identity the
/// repository records for the published file. The bound is [`io::Write`] alone: an implementation
/// that would seal its output by seeking back cannot produce an honest streaming digest, so a value
/// whose serialization only knows its geometry at the end pre-computes it instead (an array-shaped
/// artifact knows its own row count and writes header-first through [`array::SizedArrayWriter`]).
pub(crate) trait WriteInto {
    /// The failure the artifact's serialization can produce.
    type Error;

    /// Writes the artifact and returns the written bytes' digest.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails or the value has no on-disk form.
    fn write_into(&self, write: impl io::Write) -> Result<Sha256Digest, Self::Error>;
}

impl<T> WriteInto for &T
where
    T: WriteInto + ?Sized,
{
    type Error = T::Error;

    fn write_into(&self, write: impl io::Write) -> Result<Sha256Digest, Self::Error> {
        T::write_into(self, write)
    }
}

/// Marks a value as an admitted writer of the artifact `A`.
///
/// A staged write for `A` accepts exactly the values marked here, so which container may produce
/// which published file is a compile-time fact rather than a convention at the call sites.
pub(crate) trait WriteAs<A>: WriteInto {}

impl<T, A> WriteAs<A> for &T where T: WriteAs<A> + ?Sized {}

/// Returns the SHA-256 of the file at `path`, streaming its bytes.
///
/// # Errors
///
/// Returns an error when opening or reading the file fails.
pub(crate) fn digest_file(path: impl AsRef<camino::Utf8Path>) -> io::Result<Sha256Digest> {
    let path = path.as_ref();
    let _span = tracing::info_span!("digest", file = %path).entered();

    let mut writer = crate::integrity::Writer {
        accumulator: crate::integrity::Sha256::new(),
        writer: io::sink(),
    };
    io::copy(&mut std::fs::File::open(path)?, &mut writer)?;

    Ok(writer.accumulator.finalize())
}
