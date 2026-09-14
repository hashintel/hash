//! Validation and mapped lookup of published type postings.
//!
//! The archive checks run ordering and domains before exposing membership and parent views.

use core::ops::Range;

use hashql_core::id::Id as _;

use crate::{
    bitset::{DenseBitSlice, RowsIn},
    file::postings::read::PostingsFile,
    identity::{BasePosition, OntologyRowId},
    runs::{RunsError, RunsView},
};

/// A violation of the postings artifact's run or membership-count contract.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum InvalidPostingsFile {
    /// The list fenceposts break anchoring, ordering, or coverage at `position`.
    ListPosts { position: usize },
    /// The parent fenceposts break anchoring, ordering, or coverage at `position`.
    ParentPosts { position: usize },
    /// A dense type's list run is not empty.
    DenseListRun { type_row: OntologyRowId },
    /// A list run's positions are not strictly ascending.
    ListOrder { type_row: OntologyRowId },
    /// A list run holds a position at or beyond the point count.
    ListDomain { type_row: OntologyRowId },
    /// A parent list's rows are not strictly ascending.
    ParentOrder { type_row: OntologyRowId },
    /// A parent list names a row at or beyond the type count.
    ParentDomain { type_row: OntologyRowId },
    /// The direct fenceposts break anchoring, ordering, or coverage at `position`.
    DirectPosts { position: usize },
    /// A direct run's type rows are not strictly ascending.
    DirectOrder { position: BasePosition },
    /// A direct run names a row at or beyond the type count.
    DirectDomain { position: BasePosition },
    /// The direct entry count contradicts the membership total.
    PairCount {
        /// Entries in the direct map.
        direct: u64,
        /// Membership entries: the list entries plus the dense populations.
        membership: u64,
    },
}

impl core::fmt::Display for InvalidPostingsFile {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match *self {
            Self::ListPosts { position } => write!(
                fmt,
                "the list fencepost at position {position} breaks anchoring, ordering, or coverage",
            ),
            Self::ParentPosts { position } => write!(
                fmt,
                "the parent fencepost at position {position} breaks anchoring, ordering, or \
                 coverage",
            ),
            Self::DenseListRun { type_row } => write!(
                fmt,
                "type {type_row} is dense but holds a non-empty list run",
            ),
            Self::ListOrder { type_row } => {
                write!(fmt, "type {type_row}'s list run is not strictly ascending")
            }
            Self::ListDomain { type_row } => write!(
                fmt,
                "type {type_row}'s list run holds a position at or beyond the point count",
            ),
            Self::ParentOrder { type_row } => write!(
                fmt,
                "type {type_row}'s parent list is not strictly ascending",
            ),
            Self::ParentDomain { type_row } => write!(
                fmt,
                "type {type_row}'s parent list names a row at or beyond the type count",
            ),
            Self::DirectPosts { position } => write!(
                fmt,
                "the direct fencepost at position {position} breaks anchoring, ordering, or \
                 coverage",
            ),
            Self::DirectOrder { position } => write!(
                fmt,
                "position {position}'s direct run is not strictly ascending",
            ),
            Self::DirectDomain { position } => write!(
                fmt,
                "position {position}'s direct run names a row at or beyond the type count",
            ),
            Self::PairCount { direct, membership } => write!(
                fmt,
                "the direct map holds {direct} entries where the membership holds {membership}",
            ),
        }
    }
}

impl core::error::Error for InvalidPostingsFile {}

/// A published postings artifact opened over its mapped file.
///
/// Construction validates fencepost anchoring, ordering and coverage in all three run regions. It
/// also checks strict ordering and domains in list, parent and direct runs, requires empty list
/// runs for dense types, and compares the direct entry count with the membership total. This count
/// check does not establish full transpose agreement between direct types and memberships.
///
/// Lookups borrow the validated runs or dense frames from the mapped file without rebuilding them.
/// A dense type's frame index is the flag population below its row, computed at each lookup.
#[derive(Debug)]
pub(crate) struct PostingsArchive {
    file: PostingsFile,
}

impl PostingsArchive {
    /// Opens the postings over their mapped file.
    ///
    /// # Errors
    ///
    /// Returns [`InvalidPostingsFile`] when the file violates the artifact contract.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: PostingsFile) -> Result<Self, InvalidPostingsFile> {
        let types = file.types();
        let points = file.points();
        let flags = file.flags();

        let list_posts = file.list_posts();
        let lists = RunsView::from_parts(list_posts, file.list_entries()).map_err(|error| {
            InvalidPostingsFile::ListPosts {
                position: post_position(error, list_posts.len()),
            }
        })?;
        for (type_row, run) in lists.iter() {
            if flags.contains(type_row) {
                if !run.is_empty() {
                    return Err(InvalidPostingsFile::DenseListRun { type_row });
                }
            } else {
                if !run.is_sorted_by(|previous, next| previous < next) {
                    return Err(InvalidPostingsFile::ListOrder { type_row });
                }

                if run.last().is_some_and(|&last| last.as_u64() >= points) {
                    return Err(InvalidPostingsFile::ListDomain { type_row });
                }
            }
        }

        let parent_posts = file.parent_posts();
        let parents: RunsView<'_, OntologyRowId, _> =
            RunsView::from_parts(parent_posts, file.parent_ids()).map_err(|error| {
                InvalidPostingsFile::ParentPosts {
                    position: post_position(error, parent_posts.len()),
                }
            })?;
        for (type_row, list) in parents.iter() {
            if !list.is_sorted_by(|previous, next| previous < next) {
                return Err(InvalidPostingsFile::ParentOrder { type_row });
            }

            if list.last().is_some_and(|&last| last.as_u64() >= types) {
                return Err(InvalidPostingsFile::ParentDomain { type_row });
            }
        }

        let direct_posts = file.direct_posts();
        let direct: RunsView<'_, BasePosition, _> =
            RunsView::from_parts(direct_posts, file.direct_ids()).map_err(|error| {
                InvalidPostingsFile::DirectPosts {
                    position: post_position(error, direct_posts.len()),
                }
            })?;
        for (position, run) in direct.iter() {
            if !run.is_sorted_by(|previous, next| previous < next) {
                return Err(InvalidPostingsFile::DirectOrder { position });
            }

            if run.last().is_some_and(|&last| last.as_u64() >= types) {
                return Err(InvalidPostingsFile::DirectDomain { position });
            }
        }

        // a transpose has one occurrence of each position-type pair in each direction. Compare the
        // totals as a necessary condition, without reconstructing the full transpose.
        let dense_sets = file.dense_sets();
        let membership = lists.items().len() as u64
            + (0..dense_sets.len())
                .map(|rank| dense_sets[rank].count())
                .sum::<u64>();
        if direct.items().len() as u64 != membership {
            return Err(InvalidPostingsFile::PairCount {
                direct: direct.items().len() as u64,
                membership,
            });
        }

        Ok(Self { file })
    }

    /// Returns the type count `T`.
    #[inline]
    #[must_use]
    pub(crate) fn types(&self) -> u64 {
        self.file.types()
    }

    /// Returns the base-position count `N`.
    #[inline]
    #[must_use]
    pub(crate) fn points(&self) -> u64 {
        self.file.points()
    }

    /// Returns `type_row`'s membership at its stored representation, when the row is in domain.
    #[must_use]
    pub(crate) fn membership(&self, type_row: OntologyRowId) -> Option<Membership<'_>> {
        let row = type_row.as_u64();
        if row >= self.file.types() {
            return None;
        }

        let flags = self.file.flags();
        Some(if flags.contains(type_row) {
            // The frame index is the number of dense types before this one in type order.
            let rank = usize::try_from(flags.count_below(type_row))
                .expect("resident type domains fit usize");
            Membership::Dense(&self.file.dense_sets()[rank])
        } else {
            Membership::List(self.lists().run(type_row))
        })
    }

    /// Returns `type_row`'s direct parent rows, strictly ascending, when the row is in domain.
    #[must_use]
    pub(crate) fn parents(&self, type_row: OntologyRowId) -> Option<&[OntologyRowId]> {
        let row = type_row.as_u64();
        if row >= self.file.types() {
            return None;
        }

        Some(self.parent_lists().run(type_row))
    }

    /// Returns `position`'s direct type rows, strictly ascending, when the position is in domain.
    // Production reads no direct types through the archive: construction validates the region
    // against the membership total, and that is the region's whole production use. The postings
    // tests read it to verify the written direct map restates the input type column.
    #[must_use]
    pub(crate) fn direct_types(&self, position: BasePosition) -> Option<&[OntologyRowId]> {
        let index = position.as_u64();
        if index >= self.file.points() {
            return None;
        }

        Some(self.direct_runs().run(position))
    }

    /// Re-borrows the list membership regions construction validated.
    fn lists(&self) -> RunsView<'_, OntologyRowId, BasePosition> {
        RunsView::from_parts_unchecked(self.file.list_posts(), self.file.list_entries())
    }

    /// Re-borrows the parent regions construction validated.
    fn parent_lists(&self) -> RunsView<'_, OntologyRowId, OntologyRowId> {
        RunsView::from_parts_unchecked(self.file.parent_posts(), self.file.parent_ids())
    }

    /// Re-borrows the direct-map regions construction validated.
    fn direct_runs(&self) -> RunsView<'_, BasePosition, OntologyRowId> {
        RunsView::from_parts_unchecked(self.file.direct_posts(), self.file.direct_ids())
    }
}

/// Locates the invalid fencepost described by a [`RunsError`].
///
/// A missing column or broken anchor identifies the first post, an order violation identifies its
/// own index, and a closing mismatch identifies the last post.
///
/// `posts` must be the length of the fencepost column that produced `error`.
const fn post_position(error: RunsError, posts: usize) -> usize {
    match error {
        RunsError::Missing | RunsError::Anchor => 0,
        RunsError::Order { index } => index,
        RunsError::Close { .. } => posts - 1,
    }
}

/// One type's membership over the base delivery order.
///
/// Borrowed from the mapped regions at its stored representation.
#[derive(Debug, Copy, Clone)]
pub(crate) enum Membership<'map> {
    /// Base positions, strictly ascending.
    List(&'map [BasePosition]),
    /// A dense set over all `N` positions.
    Dense(&'map DenseBitSlice<BasePosition>),
}

impl Membership<'_> {
    /// Returns whether `position` is a member.
    #[must_use]
    pub(crate) fn contains(&self, position: BasePosition) -> bool {
        match self {
            Self::List(positions) => positions.binary_search(&position).is_ok(),
            Self::Dense(set) => set.contains(position),
        }
    }

    /// Iterates the member positions inside `range`, ascending.
    ///
    /// The shape a delivered run's mask column interleaves from.
    ///
    /// # Panics
    ///
    /// This panics when `range.start` exceeds `range.end`. Every caller supplies an ascending range
    /// by construction.
    pub(crate) fn positions_in(&self, range: Range<BasePosition>) -> MembershipPositions<'_> {
        match self {
            Self::List(positions) => {
                assert!(
                    range.start <= range.end,
                    "an inverted position range matches no delivered run",
                );
                let start = positions.partition_point(|&position| position < range.start);
                let end = positions.partition_point(|&position| position < range.end);

                MembershipPositions::List(positions[start..end].iter())
            }
            Self::Dense(set) => MembershipPositions::Dense(set.iter_in(range)),
        }
    }
}

/// Iterator over one membership's positions inside a range.
#[derive(Debug)]
pub(crate) enum MembershipPositions<'map> {
    /// The member slice of a list run.
    List(core::slice::Iter<'map, BasePosition>),
    /// The dense set's own range cursor.
    Dense(RowsIn<'map, BasePosition>),
}

impl Iterator for MembershipPositions<'_> {
    type Item = BasePosition;

    fn next(&mut self) -> Option<BasePosition> {
        match self {
            Self::List(positions) => positions.next().copied(),
            Self::Dense(rows) => rows.next(),
        }
    }
}
