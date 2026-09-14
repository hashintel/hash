//! Per-type membership derived from direct types in base delivery order.
//!
//! The direct map and its transpose are built together to keep both lookup directions consistent.

use std::io;

use hashql_core::id::{Id as _, IdSlice, IdVec};
use smallvec::SmallVec;
use zerocopy::U64;

use crate::{
    bitset::{DenseBitSlice, DenseBitSliceArray},
    file::{
        WriteAs, WriteInto,
        postings::write::{Regions, write_regions},
    },
    identity::{BasePosition, NodeRowId, OntologyRowId},
    integrity::{Sha256, Sha256Digest, Writer},
    runs::{Runs, RunsBuilder},
};

/// An out-of-domain type reference encountered while building postings.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum PostingsError {
    /// A node row's direct types name an ontology row outside the type domain.
    NodeType { row: NodeRowId, id: OntologyRowId },
    /// A type's direct parents name an ontology row outside the type domain.
    Parent {
        type_row: OntologyRowId,
        id: OntologyRowId,
    },
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
/// The direct map is the row-order type column gathered into position order. Deriving membership by
/// inversion keeps the two directions consistent. A type uses a dense set exactly when that set
/// costs fewer bytes than its list: [`DenseBitSlice::total_byte_len`] of the point domain against
/// four bytes per member. The choice follows from the sizes alone and carries no tuning knob. At
/// equal cost the list wins because it reads without bit decoding.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Postings {
    /// The types whose membership is a dense set.
    flags: Box<DenseBitSlice<OntologyRowId>>,
    /// Each list type's membership positions, ascending per type. A dense type's run is empty.
    lists: Runs<OntologyRowId, BasePosition>,
    /// Dense membership frames in ascending type order, each over the point domain.
    dense_sets: Box<DenseBitSliceArray<BasePosition>>,
    /// Each position's direct type rows, ascending per position.
    ///
    /// Its run count is the base-position domain `N`.
    direct: Runs<BasePosition, OntologyRowId>,
    /// Each type's direct parent rows, ascending per type.
    parents: Runs<OntologyRowId, OntologyRowId>,
}

impl Postings {
    /// Builds the postings over the finished lod permutation.
    ///
    /// `types` holds each node row's direct types in **row** order, exactly as the dataset streams
    /// them (ascending, deduplicated). `row_of_position` must be a permutation of that row domain.
    /// It gathers the direct map and membership into base delivery order. `parents` holds each
    /// ontology row's direct parents in ontology-row order, following the
    /// [`Ontology::parents`](crate::dataset::Ontology::parents) contract. Its length is the type
    /// domain `T`.
    ///
    /// # Errors
    ///
    /// Returns [`PostingsError`] when a row's direct types or a type's parents name an ontology row
    /// outside the type domain.
    ///
    /// # Panics
    ///
    /// This panics when `types` and `row_of_position` cover different row counts, when the
    /// permutation names a row outside `types`, or when a row's direct types or a type's direct
    /// parents do not ascend strictly.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "the Result carries domain errors; mismatched columns and unsorted streams are \
                  caller contract violations, documented under Panics"
    )]
    #[tracing::instrument(skip_all)]
    pub(crate) fn build(
        types: &IdSlice<NodeRowId, SmallVec<OntologyRowId, 2>>,
        row_of_position: &IdSlice<BasePosition, NodeRowId>,
        parents: &IdSlice<OntologyRowId, SmallVec<OntologyRowId, 2>>,
    ) -> Result<Self, PostingsError> {
        assert_eq!(
            types.len(),
            row_of_position.len(),
            "the type column covers one entry per base position",
        );

        let domain = parents.len();

        // gather whole type lists into position order, checking ascent and domain as each list is
        // read. Every pass below trusts these checks.
        let mut direct = RunsBuilder::with_capacity(row_of_position.len(), 0);
        for (_position, &row) in row_of_position.iter_enumerated() {
            let list = &types[row];
            assert!(
                list.is_sorted_by(|previous, next| previous < next),
                "a row's direct types ascend strictly",
            );

            for &id in list {
                if id.index_below(domain).is_none() {
                    return Err(PostingsError::NodeType { row, id });
                }
            }

            direct.push_run(list.iter().copied());
        }
        let direct = direct.finish();

        let Inverse {
            flags,
            lists,
            dense_sets,
        } = Inverse::new(&direct, domain);

        let parents = parent_regions(parents)?;

        Ok(Self {
            flags,
            lists,
            dense_sets,
            direct,
            parents,
        })
    }

    /// Counts the dense types and region populations behind the artifact's size.
    #[must_use]
    pub(crate) fn measurements(&self) -> PostingsMeasurements {
        PostingsMeasurements {
            types: self.lists.runs() as u64,
            dense_types: self.dense_sets.len() as u64,
            list_entries: self.lists.items().len() as u64,
            parent_edges: self.parents.items().len() as u64,
            direct_entries: self.direct.items().len() as u64,
        }
    }
}

/// The membership regions [`Inverse::new`] derives from the direct map.
struct Inverse {
    /// The types whose membership is a dense set.
    flags: Box<DenseBitSlice<OntologyRowId>>,
    /// Each list type's membership positions, ascending per type. A dense type's run is empty.
    lists: Runs<OntologyRowId, BasePosition>,
    /// The dense membership sets, one frame per dense type in ascending type order.
    dense_sets: Box<DenseBitSliceArray<BasePosition>>,
}

impl Inverse {
    /// Inverts the position-major direct map into the per-type membership regions.
    ///
    /// A type's membership holds exactly the positions whose direct runs name the type. Walking
    /// positions ascending produces sorted list runs without a sort pass.
    ///
    /// Every direct id must lie below `domain`.
    ///
    /// # Panics
    ///
    /// This panics when a direct id lies outside `domain`.
    fn new(direct: &Runs<BasePosition, OntologyRowId>, domain: usize) -> Self {
        let points = direct.runs();

        // member counts determine each type's representation and its final region. Their prefix
        // sums place each list run for the fill pass.
        let mut counts = IdVec::from_elem(0_u64, domain);
        for &id in direct.items() {
            counts[id] += 1;
        }

        // The representation choice is the size comparison, in bytes on both sides: a dense set
        // costs the whole frame regardless of population while a list costs one position entry per
        // member. The strict inequality sends the equal-cost case to the list, which reads without
        // decoding.
        let dense_bytes = DenseBitSlice::<BasePosition>::total_byte_len(points as u64);
        let is_dense = |count: u64| dense_bytes < count * size_of::<BasePosition>() as u64;

        // counting dense types before allocation gives one region laid out exactly as the file
        // stores it.
        let dense_count = counts.iter().filter(|&&count| is_dense(count)).count();
        let mut dense_sets = DenseBitSliceArray::<BasePosition>::new_empty(points, dense_count);

        let mut flags = DenseBitSlice::<OntologyRowId>::new_empty(domain);
        let mut ranks = IdVec::from_elem(0_u32, domain);
        let mut list_posts = Vec::with_capacity(domain + 1);
        list_posts.push(0);

        let mut next_rank = 0_usize;
        let mut total = 0_usize;
        for (type_row, &count) in counts.iter_enumerated() {
            if is_dense(count) {
                flags.insert(type_row);
                ranks[type_row] =
                    u32::try_from(next_rank).expect("dense types fit the type domain");
                next_rank += 1;
            } else {
                total += usize::try_from(count).expect("resident entries fit the address space");
            }

            list_posts.push(total);
        }

        // fill in position order: each list run's cursor starts at its fencepost and writes
        // ascending positions without a sort. Dense members insert into their type's set.
        let mut list_entries = vec![BasePosition::from_u32(0); total];
        let mut cursors: IdVec<OntologyRowId, usize> =
            IdVec::from_raw(list_posts[..domain].to_vec());

        for (position, run) in direct.iter() {
            for &id in run {
                if flags.contains(id) {
                    dense_sets[ranks[id] as usize].insert(position);
                } else {
                    let slot = cursors[id];
                    list_entries[slot] = position;
                    cursors[id] += 1;
                }
            }
        }

        let posts = IdVec::from_raw(
            list_posts
                .iter()
                .map(|&post| U64::new(post as u64))
                .collect(),
        );
        let lists = Runs::from_parts(posts, list_entries).expect(
            "prefix sums over the counts anchor at zero, never decrease, and close at the fill's \
             entry count",
        );

        Self {
            flags,
            lists,
            dense_sets,
        }
    }
}

impl WriteAs<crate::file::salt::artifact::Postings> for Postings {}

impl WriteInto for Postings {
    type Error = io::Error;

    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        write_regions(
            Regions {
                flags: &self.flags,
                lists: &self.lists,
                dense_sets: &self.dense_sets,
                parents: &self.parents,
                direct: &self.direct,
            },
            &mut writer,
        )?;

        Ok(writer.accumulator.finalize())
    }
}

/// The measurements of one postings build.
///
/// What the manifest records so the representation split follows data rather than taste. Not
/// evidence: the metadata's `Evidence` section holds admission checks, while these are build
/// census numbers.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PostingsMeasurements {
    /// Types in the domain.
    pub types: u64,
    /// Types whose membership uses a dense set under the size comparison.
    pub dense_types: u64,
    /// Entries in the list region: every list type's positions.
    pub list_entries: u64,
    /// Direct parent edges in the type graph.
    pub parent_edges: u64,
    /// Entries in the direct map: one per position-type pair.
    pub direct_entries: u64,
}

/// Gathers the parent lists into their per-type runs.
///
/// Parent references may point forward. Their domain is the full length of `parents`.
///
/// # Errors
///
/// Returns [`PostingsError`] for an out-of-domain parent reference.
///
/// # Panics
///
/// This panics when a type's direct parents do not ascend strictly.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries domain errors; an unsorted parent stream is a caller contract \
              violation, documented under Panics"
)]
fn parent_regions(
    parents: &IdSlice<OntologyRowId, SmallVec<OntologyRowId, 2>>,
) -> Result<Runs<OntologyRowId, OntologyRowId>, PostingsError> {
    let domain = parents.len();

    let mut runs = RunsBuilder::with_capacity(domain, 0);
    for (type_row, list) in parents.iter_enumerated() {
        assert!(
            list.is_sorted_by(|previous, next| previous < next),
            "a type's direct parents ascend strictly",
        );

        for &id in list {
            if id.index_below(domain).is_none() {
                return Err(PostingsError::Parent { type_row, id });
            }
        }

        runs.push_run(list.iter().copied());
    }

    Ok(runs.finish())
}
