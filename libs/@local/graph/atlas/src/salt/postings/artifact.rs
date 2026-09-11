//! The postings archive and the membership views it serves.

use core::ops::Range;

use hashql_core::id::Id as _;

use crate::{
    bitset::{DenseBitSlice, RowsIn},
    file::postings::read::PostingsFile,
    identity::{BasePosition, OntologyRowId},
    runs::{RunsError, RunsView},
};

/// An opened postings file does not hold a valid postings artifact.
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
/// Construction checks the artifact contract once - fencepost anchoring/ordering/coverage in all
/// three fencepost regions, list ascent and domains, empty list runs for dense types, parent
/// ascent and domains, direct ascent and domains, and the pair count tying the direct map to the
/// membership total. An open postings therefore only serves valid runs and consumers re-validate
/// nothing. The bit set
/// frames were already validated when the file opened, where the format's geometry lives. The
/// archive holds the mapped file alone, and each lookup re-borrows its fencepost and items
/// regions as a [`RunsView`] pair the construction validated. A dense type's frame index is the
/// flag population below its row, read from the mapped flags frame at each lookup, so every
/// answer comes from file bytes and the regions stay in the page cache under memory pressure.
#[derive(Debug)]
pub(crate) struct PostingsArchive {
    file: PostingsFile,
}

impl PostingsArchive {
    /// Opens the postings over their mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file violates the artifact contract.
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

        // Every position-type pair appears once in each direction, so the direct entry count is
        // the membership total: the list entries plus the dense populations.
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

/// Names the fencepost position a [`RunsError`] faults, for the per-region error variants.
///
/// A missing column and a broken anchor fault the first post, a break in the order faults its
/// own index, and a closing mismatch faults the last post - exactly the positions the archive
/// reported before the fencepost law moved into [`RunsView`].
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
