//! The postings build: from the row-order type column to the file's regions.

use std::io;

use hashql_core::id::{Id as _, IdSlice, IdVec};
use smallvec::SmallVec;

use crate::{
    file::{
        WriteInto,
        postings::write::{Regions, write_regions},
    },
    identity::{BasePosition, NodeRowId, OntologyRowId},
    integrity::{Sha256, Sha256Digest, Writer},
    math::Log2,
};

/// The default [`PostingsConfig::dense_threshold`].
const DEFAULT_DENSE_THRESHOLD: Log2 = Log2::new(5).expect("5 lies below the shift width");

/// Configuration of the postings representation split.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PostingsConfig {
    /// A type's membership goes dense when its member count exceeds `N >> dense_threshold`.
    ///
    /// The default 5 (one in 32) is the size-equality point - one list entry costs 32 bitmap bits -
    /// so a dense run is never larger than the list it replaces; the word-parallel OR already wins
    /// work at half that density. At exact equality the list wins: it reads without bit decoding.
    pub dense_threshold: Log2 = DEFAULT_DENSE_THRESHOLD,
}

const impl Default for PostingsConfig {
    fn default() -> Self {
        Self { .. }
    }
}

/// Building the postings failed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum PostingsError {
    /// A node row's direct types name an ontology row outside the type domain.
    NodeType { row: u32, id: u64 },
    /// A type's direct parents name an ontology row outside the type domain.
    Parent { type_row: u32, id: u64 },
}

impl core::fmt::Display for PostingsError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::NodeType { row, id } => write!(
                fmt,
                "node row {row} names ontology row {id}, outside the type domain",
            ),
            Self::Parent { type_row, id } => write!(
                fmt,
                "type {type_row} names parent ontology row {id}, outside the type domain",
            ),
        }
    }
}

impl core::error::Error for PostingsError {}

/// The type postings of one generation, in writable form.
///
/// Construction picks each type's representation and lays every region out exactly as the file
/// stores it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Postings {
    /// The base-position domain `N`.
    points: u64,
    /// One bit per type, set when the type's run is a dense bitmap.
    flags: Vec<u64>,
    /// `T + 1` membership fenceposts over [`Self::entries`].
    membership_posts: Vec<u64>,
    /// The membership entries, type-major.
    ///
    /// Sorted positions for list types, `ceil(N/32)` bitmap words for dense types.
    entries: Vec<u32>,
    /// `T + 1` parent fenceposts over [`Self::parent_ids`].
    parent_posts: Vec<u64>,
    /// The direct parent rows, type-major, ascending per type.
    parent_ids: Vec<u64>,
}

impl Postings {
    /// Builds the postings over the finished lod permutation.
    ///
    /// `types` holds each node row's direct types in **row** order, exactly as the dataset streams
    /// them (ascending, deduplicated); `row_of_position` is the lod's gather order, so membership
    /// lands in base delivery order. `parents` holds each ontology row's direct parents in
    /// ontology-row order - the [`Ontology::parents`](crate::dataset::Ontology::parents) contract,
    /// restated in file shape -
    /// and its length is the type domain `T`. Walking positions ascending makes every list run
    /// sorted by construction: no sort pass exists.
    ///
    /// # Errors
    ///
    /// Returns [`PostingsError`] when a row's direct types or a type's parents name an ontology row
    /// outside the type domain.
    ///
    /// # Panics
    ///
    /// Panics when `types` and `row_of_position` cover different row counts - the lod build already
    /// rejected mismatched columns, so a disagreement here is a producer bug.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "the Result carries domain errors; mismatched columns are a caller contract \
                  violation, documented under Panics"
    )]
    pub(crate) fn build(
        types: &IdSlice<NodeRowId, SmallVec<OntologyRowId, 2>>,
        row_of_position: &IdSlice<BasePosition, NodeRowId>,
        parents: &IdSlice<OntologyRowId, SmallVec<OntologyRowId, 2>>,
        config: PostingsConfig,
    ) -> Result<Self, PostingsError> {
        assert_eq!(
            types.len(),
            row_of_position.len(),
            "the type column covers one entry per base position",
        );

        let points = types.len() as u64;
        let domain = parents.len();

        // Member counts first: they pick each type's representation
        // and become the fenceposts, so entries land in place below.
        let mut counts = IdVec::from_elem(0, domain);
        for (row, list) in types.iter_enumerated() {
            for &id in list {
                let count = counts.get_mut(id).ok_or_else(|| PostingsError::NodeType {
                    row: u32::try_from(row.as_u64()).expect("the lod columns index rows by u32"),
                    id: id.as_u64(),
                })?;
                *count += 1;
            }
        }

        let dense_words = points.div_ceil(u64::from(u32::BITS));
        let threshold = points >> config.dense_threshold.get();

        let mut flags = vec![0_u64; domain.div_ceil(u64::BITS as usize)];
        let mut membership_posts = Vec::with_capacity(domain + 1);
        membership_posts.push(0);
        let mut total = 0_u64;
        for (type_row, &count) in counts.iter_enumerated() {
            if count > threshold && dense_words < count {
                let ordinal = type_row.as_usize();
                flags[ordinal >> 6] |= 1 << (ordinal & 63);
                total += dense_words;
            } else {
                total += count;
            }

            membership_posts.push(total);
        }

        // Fill in position order: each list run's cursor starts at its
        // fencepost and ascending positions land ascending in place;
        // dense runs set their position bit in place.
        let mut entries =
            vec![0_u32; usize::try_from(total).expect("resident entries fit the address space")];
        let mut cursors: Vec<u64> = membership_posts[..domain].to_vec();
        for (position, &row) in row_of_position.iter_enumerated() {
            for &id in &types[row] {
                let type_row =
                    usize::try_from(id.as_u64()).expect("the counting pass validated the domain");

                if flags[type_row >> 6] & (1 << (type_row & 63)) != 0 {
                    let base = usize::try_from(membership_posts[type_row])
                        .expect("resident entries fit the address space");
                    let bit = position.as_usize();
                    entries[base + (bit >> 5)] |= 1 << (bit & 31);
                } else {
                    let slot = usize::try_from(cursors[type_row])
                        .expect("resident entries fit the address space");
                    entries[slot] = position.as_u32();
                    cursors[type_row] += 1;
                }
            }
        }

        let (parent_posts, parent_ids) = parent_regions(parents)?;

        Ok(Self {
            points,
            flags,
            membership_posts,
            entries,
            parent_posts,
            parent_ids,
        })
    }

    /// Measures the finished regions for the generation metadata.
    ///
    /// The measurements the manifest records so the threshold knob is revised from data, not taste:
    /// how many types the split sent dense, and the region populations behind the artifact's size.
    #[must_use]
    pub(crate) fn measurements(&self) -> PostingsMeasurements {
        PostingsMeasurements {
            types: self.membership_posts.len() as u64 - 1,
            dense_types: self
                .flags
                .iter()
                .map(|&word| u64::from(word.count_ones()))
                .sum(),
            membership_entries: self.entries.len() as u64,
            parent_edges: self.parent_ids.len() as u64,
        }
    }
}

impl WriteInto for Postings {
    type Error = io::Error;

    /// Writes the postings as a postings file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the repository records for the
    /// published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        write_regions(
            Regions {
                points: self.points,
                flags: &self.flags,
                membership_posts: &self.membership_posts,
                entries: &self.entries,
                parent_posts: &self.parent_posts,
                parent_ids: &self.parent_ids,
            },
            &mut writer,
        )?;

        Ok(writer.accumulator.finalize())
    }
}

/// The measurements of one postings build.
///
/// What the manifest records so the configuration is revised from data, not taste. Not evidence:
/// the metadata's `Evidence` section holds admission checks, while these are build census numbers.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PostingsMeasurements {
    /// Types in the domain.
    pub types: u64,
    /// Types whose membership went dense under the threshold.
    pub dense_types: u64,
    /// Entries in the membership region: list positions plus dense bitmap words.
    pub membership_entries: u64,
    /// Direct parent edges in the type graph.
    pub parent_edges: u64,
}

/// Lays the parent regions out in file shape.
///
/// The regions restate the dataset's stream; the domain check is the one condition the stream
/// cannot carry itself (parents may point forward).
fn parent_regions(
    parents: &IdSlice<OntologyRowId, SmallVec<OntologyRowId, 2>>,
) -> Result<(Vec<u64>, Vec<u64>), PostingsError> {
    let domain = parents.len();

    let mut posts = Vec::with_capacity(domain + 1);
    posts.push(0);
    let mut ids = Vec::new();
    for (type_row, list) in parents.iter().enumerate() {
        for &id in list {
            if id.index_below(domain).is_none() {
                return Err(PostingsError::Parent {
                    type_row: u32::try_from(type_row).expect("type domains stay far below u32"),
                    id: id.as_u64(),
                });
            }
            ids.push(id.as_u64());
        }
        posts.push(ids.len() as u64);
    }

    Ok((posts, ids))
}
