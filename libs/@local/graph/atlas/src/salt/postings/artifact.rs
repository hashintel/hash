//! The postings archive and the membership views it serves.

use core::ops::Range;

use hashql_core::id::Id as _;
use zerocopy::{LE, U64};

use crate::{
    bitset::{DenseBitSlice, RowsIn},
    file::postings::read::PostingsFile,
    identity::{BasePosition, OntologyRowId},
};

/// An opened postings file does not hold a valid postings artifact.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum InvalidPostingsFile {
    /// The list fenceposts break anchoring, ordering, or coverage at `position`.
    ListPosts { position: usize },
    /// The parent fenceposts break anchoring, ordering, or coverage at `position`.
    ParentPosts { position: usize },
    /// A dense type's list run is not empty.
    DenseListRun { type_row: u64 },
    /// A list run's positions are not strictly ascending.
    ListOrder { type_row: u64 },
    /// A list run holds a position at or beyond the point count.
    ListDomain { type_row: u64 },
    /// A parent list's rows are not strictly ascending.
    ParentOrder { type_row: u64 },
    /// A parent list names a row at or beyond the type count.
    ParentDomain { type_row: u64 },
    /// The direct fenceposts break anchoring, ordering, or coverage at `position`.
    DirectPosts { position: usize },
    /// A direct run's type rows are not strictly ascending.
    DirectOrder { position: u64 },
    /// A direct run names a row at or beyond the type count.
    DirectDomain { position: u64 },
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
/// archive holds the mapped file alone. A dense type's frame index is the flag population below
/// its row, read from the mapped flags frame at each lookup, so every answer comes from file
/// bytes and the regions stay in the page cache under memory pressure.
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
        let list_entries = file.list_entries();
        let parent_ids = file.parent_ids();

        validate_posts(file.list_posts(), list_entries.len() as u64, |position| {
            InvalidPostingsFile::ListPosts { position }
        })?;
        validate_posts(file.parent_posts(), parent_ids.len() as u64, |position| {
            InvalidPostingsFile::ParentPosts { position }
        })?;

        let list_posts = file.list_posts();
        for type_row in 0..types {
            let run = run_of(list_posts, list_entries, type_row);

            if flags.contains(OntologyRowId::from_u64(type_row)) {
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
        for type_row in 0..types {
            let list = run_of(parent_posts, parent_ids, type_row);
            if !list.is_sorted_by(|previous, next| previous < next) {
                return Err(InvalidPostingsFile::ParentOrder { type_row });
            }

            if list.last().is_some_and(|&last| last.as_u64() >= types) {
                return Err(InvalidPostingsFile::ParentDomain { type_row });
            }
        }

        let direct_ids = file.direct_ids();
        validate_posts(file.direct_posts(), direct_ids.len() as u64, |position| {
            InvalidPostingsFile::DirectPosts { position }
        })?;

        let direct_posts = file.direct_posts();
        for position in 0..points {
            let run = run_of(direct_posts, direct_ids, position);
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
        let membership = list_entries.len() as u64
            + (0..dense_sets.len())
                .map(|rank| dense_sets[rank].count())
                .sum::<u64>();
        if direct_ids.len() as u64 != membership {
            return Err(InvalidPostingsFile::PairCount {
                direct: direct_ids.len() as u64,
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
            Membership::List(run_of(
                self.file.list_posts(),
                self.file.list_entries(),
                row,
            ))
        })
    }

    /// Returns `type_row`'s direct parent rows, strictly ascending, when the row is in domain.
    #[must_use]
    pub(crate) fn parents(&self, type_row: OntologyRowId) -> Option<&[OntologyRowId]> {
        let row = type_row.as_u64();
        if row >= self.file.types() {
            return None;
        }

        Some(run_of(
            self.file.parent_posts(),
            self.file.parent_ids(),
            row,
        ))
    }

    /// Returns `position`'s direct type rows, strictly ascending, when the position is in domain.
    #[must_use]
    pub(crate) fn direct_types(&self, position: BasePosition) -> Option<&[OntologyRowId]> {
        let index = position.as_u64();
        if index >= self.file.points() {
            return None;
        }

        Some(run_of(
            self.file.direct_posts(),
            self.file.direct_ids(),
            index,
        ))
    }
}

/// Borrows run `index` of a fencepost-delimited array.
fn run_of<'map, T>(posts: &[U64<LE>], values: &'map [T], index: u64) -> &'map [T] {
    let index = usize::try_from(index).expect("resident domains fit usize");
    let start = usize::try_from(posts[index].get()).expect("entries fit the address space");
    let end = usize::try_from(posts[index + 1].get()).expect("entries fit the address space");

    &values[start..end]
}

/// Checks one fencepost region: anchored at zero, non-decreasing, closing at the array length.
fn validate_posts(
    posts: &[U64<LE>],
    close: u64,
    error: impl Fn(usize) -> InvalidPostingsFile,
) -> Result<(), InvalidPostingsFile> {
    if posts.first().map(|post| post.get()) != Some(0) {
        return Err(error(0));
    }
    if let Some(position) = (1..posts.len()).find(|&position| posts[position] < posts[position - 1])
    {
        return Err(error(position));
    }
    if posts.last().map(|post| post.get()) != Some(close) {
        return Err(error(posts.len() - 1));
    }

    Ok(())
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
    /// Returns the number of member positions.
    #[must_use]
    pub(crate) fn count(&self) -> u64 {
        match self {
            Self::List(positions) => positions.len() as u64,
            Self::Dense(set) => set.count(),
        }
    }

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
