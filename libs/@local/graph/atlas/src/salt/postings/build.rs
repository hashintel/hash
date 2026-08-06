//! The postings build turns the row-order type column into the file's regions.

use std::io;

use hashql_core::id::{Id as _, IdSlice, IdVec};
use smallvec::SmallVec;

use crate::{
    bitset::{DenseBitSlice, DenseBitSliceArray},
    file::{
        WriteInto,
        postings::write::{Regions, write_regions},
    },
    identity::{BasePosition, NodeRowId, OntologyRowId},
    integrity::{Sha256, Sha256Digest, Writer},
};

/// Building the postings failed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum PostingsError {
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
/// The direct map is the one stored relation - the row-order type column gathered into position
/// order - and the membership regions are its inversion, so the two directions agree by
/// construction. Construction picks each type's representation and lays every region out exactly
/// as the file stores it. A type goes dense exactly when its dense set costs fewer bytes than its
/// list - [`DenseBitSlice::total_byte_len`] of the point domain against four bytes per member -
/// so the choice follows from the sizes alone and carries no tuning knob. At equal cost the list
/// wins because it reads without bit decoding.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Postings {
    /// The base-position domain `N`.
    points: u64,
    /// The types whose membership is a dense set.
    flags: Box<DenseBitSlice<OntologyRowId>>,
    /// `T + 1` list fenceposts over [`Self::list_entries`]. A dense type's run is empty.
    list_posts: Vec<u64>,
    /// The list membership entries, type-major, ascending per type.
    list_entries: Vec<BasePosition>,
    /// The dense membership sets, one frame per dense type in ascending type order, each over
    /// the point domain.
    dense_sets: Box<DenseBitSliceArray<BasePosition>>,
    /// `N + 1` direct fenceposts over [`Self::direct_ids`].
    direct_posts: Vec<u64>,
    /// Each position's direct type rows, position-major, ascending per position.
    direct_ids: Vec<OntologyRowId>,
    /// `T + 1` parent fenceposts over [`Self::parent_ids`].
    parent_posts: Vec<u64>,
    /// The direct parent rows, type-major, ascending per type.
    parent_ids: Vec<OntologyRowId>,
}

impl Postings {
    /// Builds the postings over the finished lod permutation.
    ///
    /// `types` holds each node row's direct types in **row** order, exactly as the dataset streams
    /// them (ascending, deduplicated); `row_of_position` is the lod's gather order, so the direct
    /// map and the membership follow base delivery order. `parents` holds each ontology row's
    /// direct parents in ontology-row order - the
    /// [`Ontology::parents`](crate::dataset::Ontology::parents) contract, restated in file shape -
    /// and its length is the type domain `T`. The build gathers the direct map first and derives
    /// the membership regions from it by [`invert`], so every check of one direction binds the
    /// other.
    ///
    /// # Errors
    ///
    /// Returns [`PostingsError`] when a row's direct types or a type's parents name an ontology row
    /// outside the type domain.
    ///
    /// # Panics
    ///
    /// This panics when `types` and `row_of_position` cover different row counts, and when a
    /// row's direct types do not ascend strictly. The lod build already rejected mismatched
    /// columns and the dataset contract promises ascending, deduplicated lists, so either
    /// disagreement here is a producer bug.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "the Result carries domain errors; mismatched columns and unsorted streams are \
                  caller contract violations, documented under Panics"
    )]
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

        let points = types.len() as u64;
        let domain = parents.len();

        // The direct map is the gather itself: each position's run restates its row's type list
        // verbatim, so the runs inherit the column's ascent and deduplication. The domain and
        // ascent checks ride the gather. Every pass below trusts them.
        let mut direct_posts = Vec::with_capacity(row_of_position.len() + 1);
        direct_posts.push(0);
        let mut direct_ids = Vec::new();
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

                direct_ids.push(id);
            }

            direct_posts.push(direct_ids.len() as u64);
        }

        let Inverse {
            flags,
            list_posts,
            list_entries,
            dense_sets,
        } = invert(&direct_posts, &direct_ids, domain);

        let (parent_posts, parent_ids) = parent_regions(parents)?;

        Ok(Self {
            points,
            flags,
            list_posts,
            list_entries,
            dense_sets,
            direct_posts,
            direct_ids,
            parent_posts,
            parent_ids,
        })
    }

    /// Measures the finished regions for the generation metadata.
    ///
    /// The measurements the manifest records so the representation split follows data rather than
    /// taste: how many types went dense, and the region populations behind the artifact's size.
    #[must_use]
    pub(crate) fn measurements(&self) -> PostingsMeasurements {
        PostingsMeasurements {
            types: self.list_posts.len() as u64 - 1,
            dense_types: self.dense_sets.len() as u64,
            list_entries: self.list_entries.len() as u64,
            parent_edges: self.parent_ids.len() as u64,
            direct_entries: self.direct_ids.len() as u64,
        }
    }
}

/// The membership regions [`invert`] derives from the direct map.
struct Inverse {
    /// The types whose membership is a dense set.
    flags: Box<DenseBitSlice<OntologyRowId>>,
    /// `T + 1` list fenceposts. A dense type's run is empty.
    list_posts: Vec<u64>,
    /// The list membership entries, type-major, ascending per type.
    list_entries: Vec<BasePosition>,
    /// The dense membership sets, one frame per dense type in ascending type order.
    dense_sets: Box<DenseBitSliceArray<BasePosition>>,
}

/// Inverts the position-major direct map into the per-type membership regions.
///
/// This is the transpose: a type's membership holds exactly the positions whose direct runs name
/// the type, so the two directions carry one relation. Walking positions ascending makes every
/// list run sorted by construction: no sort pass exists.
///
/// Every direct id lies below `domain`. [`Postings::build`] validated that while gathering.
fn invert(direct_posts: &[u64], direct_ids: &[OntologyRowId], domain: usize) -> Inverse {
    let points = direct_posts.len() - 1;

    // Member counts first: they pick each type's representation and become the fenceposts, so
    // the fill pass below writes each entry at its final slot.
    let mut counts = IdVec::from_elem(0_u64, domain);
    for &id in direct_ids {
        counts[id] += 1;
    }

    // The representation choice is the size comparison, in bytes on both sides: a dense set
    // costs the whole frame regardless of population while a list costs one position entry per
    // member. The strict inequality sends the equal-cost case to the list, which reads without
    // decoding.
    let dense_bytes = DenseBitSlice::<BasePosition>::total_byte_len(points as u64);
    let is_dense = |count: u64| dense_bytes < count * size_of::<BasePosition>() as u64;

    // The dense count is known before the region exists, so the sets live in one allocation
    // laid out exactly as the file stores them.
    let dense_count = counts.iter().filter(|&&count| is_dense(count)).count();
    let mut dense_sets = DenseBitSliceArray::<BasePosition>::new_empty(points, dense_count);

    let mut flags = DenseBitSlice::<OntologyRowId>::new_empty(domain);
    let mut ranks = IdVec::from_elem(0_u32, domain);
    let mut list_posts = Vec::with_capacity(domain + 1);
    list_posts.push(0);

    let mut next_rank = 0_usize;
    let mut total = 0_u64;
    for (type_row, &count) in counts.iter_enumerated() {
        if is_dense(count) {
            flags.insert(type_row);
            ranks[type_row] = u32::try_from(next_rank).expect("dense types fit the type domain");
            next_rank += 1;
        } else {
            total += count;
        }

        list_posts.push(total);
    }

    // Fill in position order: each list run's cursor starts at its fencepost and ascending
    // positions land ascending in place. Dense members insert into their type's set.
    let mut list_entries = vec![
        BasePosition::from_u32(0);
        usize::try_from(total)
            .expect("resident entries fit the address space")
    ];
    let mut cursors: Vec<u64> = list_posts[..domain].to_vec();

    for position in 0..points {
        let start = usize::try_from(direct_posts[position])
            .expect("resident entries fit the address space");
        let end = usize::try_from(direct_posts[position + 1])
            .expect("resident entries fit the address space");

        for &id in &direct_ids[start..end] {
            if flags.contains(id) {
                dense_sets[ranks[id] as usize].insert(BasePosition::from_usize(position));
            } else {
                let type_row =
                    usize::try_from(id.as_u64()).expect("the gather validated the domain");
                let slot = usize::try_from(cursors[type_row])
                    .expect("resident entries fit the address space");
                list_entries[slot] = BasePosition::from_usize(position);
                cursors[type_row] += 1;
            }
        }
    }

    Inverse {
        flags,
        list_posts,
        list_entries,
        dense_sets,
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
                list_posts: &self.list_posts,
                list_entries: &self.list_entries,
                dense_sets: &self.dense_sets,
                parent_posts: &self.parent_posts,
                parent_ids: &self.parent_ids,
                direct_posts: &self.direct_posts,
                direct_ids: &self.direct_ids,
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
    /// Types whose membership went dense under the size comparison.
    pub dense_types: u64,
    /// Entries in the list region: every list type's positions.
    pub list_entries: u64,
    /// Direct parent edges in the type graph.
    pub parent_edges: u64,
    /// Entries in the direct map: one per position-type pair.
    pub direct_entries: u64,
}

/// Lays the parent regions out in file shape.
///
/// The regions restate the dataset's stream. The domain check is the one condition the stream
/// cannot carry itself (parents may point forward). Ascent is the stream's own contract and is
/// asserted here, so a defective stream fails the build instead of publishing a file the next
/// open refuses.
///
/// # Panics
///
/// This panics when a type's direct parents do not ascend strictly. The
/// [`Ontology::parents`](crate::dataset::Ontology::parents) contract promises ascending,
/// deduplicated lists, so a violation here is a producer bug.
#[expect(
    clippy::panic_in_result_fn,
    reason = "the Result carries domain errors; an unsorted parent stream is a caller contract \
              violation, documented under Panics"
)]
fn parent_regions(
    parents: &IdSlice<OntologyRowId, SmallVec<OntologyRowId, 2>>,
) -> Result<(Vec<u64>, Vec<OntologyRowId>), PostingsError> {
    let domain = parents.len();

    let mut posts = Vec::with_capacity(domain + 1);
    posts.push(0);

    let mut ids = Vec::new();
    for (type_row, list) in parents.iter_enumerated() {
        assert!(
            list.is_sorted_by(|previous, next| previous < next),
            "a type's direct parents ascend strictly",
        );

        for &id in list {
            if id.index_below(domain).is_none() {
                return Err(PostingsError::Parent { type_row, id });
            }

            ids.push(id);
        }

        posts.push(ids.len() as u64);
    }

    Ok((posts, ids))
}
