//! The postings archive and the membership views it serves.

use core::ops::Range;

use crate::{dataset::OntologyRowId, file::postings::read::PostingsFile};

/// An opened postings file does not hold a valid postings artifact.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum InvalidPostingsFile {
    /// A flags bit at or beyond the type count is set.
    FlagsTail,
    /// The membership fenceposts break anchoring, ordering, or coverage at `position`.
    MembershipPosts { position: usize },
    /// The parent fenceposts break anchoring, ordering, or coverage at `position`.
    ParentPosts { position: usize },
    /// A dense run's length is not the bitmap word count.
    DenseLength { type_row: u64 },
    /// A dense run sets a bit at or beyond the point count.
    DenseTail { type_row: u64 },
    /// A list run's positions are not strictly ascending.
    ListOrder { type_row: u64 },
    /// A list run holds a position at or beyond the point count.
    ListDomain { type_row: u64 },
    /// A parent list's rows are not strictly ascending.
    ParentOrder { type_row: u64 },
    /// A parent list names a row at or beyond the type count.
    ParentDomain { type_row: u64 },
}

impl core::fmt::Display for InvalidPostingsFile {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match *self {
            Self::FlagsTail => write!(fmt, "a flags bit at or beyond the type count is set"),
            Self::MembershipPosts { position } => write!(
                fmt,
                "the membership fencepost at position {position} breaks anchoring, ordering, or \
                 coverage",
            ),
            Self::ParentPosts { position } => write!(
                fmt,
                "the parent fencepost at position {position} breaks anchoring, ordering, or \
                 coverage",
            ),
            Self::DenseLength { type_row } => write!(
                fmt,
                "type {type_row}'s dense run is not the bitmap word count",
            ),
            Self::DenseTail { type_row } => write!(
                fmt,
                "type {type_row}'s dense run sets a bit at or beyond the point count",
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
        }
    }
}

impl core::error::Error for InvalidPostingsFile {}

/// A published postings artifact opened over its mapped file.
///
/// Construction checks the artifact contract once - fencepost anchoring/ordering/coverage in both
/// regions, dense run lengths and tail bits, list ascent and domains, parent ascent and domains -
/// so an open postings only serves valid runs and consumers re-validate nothing. The regions stay
/// in the page cache under memory pressure and off the heap.
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
        let entries = file.entries();
        let parent_ids = file.parent_ids();

        if let Some(&last) = flags.last()
            && !types.is_multiple_of(u64::from(u64::BITS))
            && last >> (types & u64::from(u64::BITS - 1)) != 0
        {
            return Err(InvalidPostingsFile::FlagsTail);
        }

        validate_posts(file.membership_posts(), entries.len() as u64, |position| {
            InvalidPostingsFile::MembershipPosts { position }
        })?;
        validate_posts(file.parent_posts(), parent_ids.len() as u64, |position| {
            InvalidPostingsFile::ParentPosts { position }
        })?;

        let dense_words = points.div_ceil(u64::from(u32::BITS));
        let membership_posts = file.membership_posts();
        for type_row in 0..types {
            let run = run_of(membership_posts, entries, type_row);

            if flags[usize::try_from(type_row >> 6).expect("flag words fit the address space")]
                & (1 << (type_row & 63))
                != 0
            {
                if run.len() as u64 != dense_words {
                    return Err(InvalidPostingsFile::DenseLength { type_row });
                }
                if let Some(&last) = run.last()
                    && !points.is_multiple_of(u64::from(u32::BITS))
                    && u64::from(last) >> (points & u64::from(u32::BITS - 1)) != 0
                {
                    return Err(InvalidPostingsFile::DenseTail { type_row });
                }
            } else {
                if !run.is_sorted_by(|previous, next| previous < next) {
                    return Err(InvalidPostingsFile::ListOrder { type_row });
                }
                if run.last().is_some_and(|&last| u64::from(last) >= points) {
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
            if list.last().is_some_and(|&last| u64::from(last) >= types) {
                return Err(InvalidPostingsFile::ParentDomain { type_row });
            }
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
        let row = type_row.get();
        if row >= self.file.types() {
            return None;
        }

        let run = run_of(self.file.membership_posts(), self.file.entries(), row);
        let dense = self.file.flags()
            [usize::try_from(row >> 6).expect("flag words fit the address space")]
            & (1 << (row & 63))
            != 0;

        Some(if dense {
            Membership::Dense(run)
        } else {
            Membership::List(run)
        })
    }

    /// Returns `type_row`'s direct parent rows, strictly ascending, when the row is in domain.
    #[must_use]
    pub(crate) fn parents(&self, type_row: OntologyRowId) -> Option<&[u32]> {
        let row = type_row.get();
        if row >= self.file.types() {
            return None;
        }

        Some(run_of(
            self.file.parent_posts(),
            self.file.parent_ids(),
            row,
        ))
    }
}

/// Borrows type `type_row`'s run of a fencepost-delimited array.
fn run_of<'map>(posts: &[u64], values: &'map [u32], type_row: u64) -> &'map [u32] {
    let row = usize::try_from(type_row).expect("resident type domains fit usize");
    let start = usize::try_from(posts[row]).expect("entries fit the address space");
    let end = usize::try_from(posts[row + 1]).expect("entries fit the address space");

    &values[start..end]
}

/// Checks one fencepost region: anchored at zero, non-decreasing, closing at the array length.
fn validate_posts(
    posts: &[u64],
    close: u64,
    error: impl Fn(usize) -> InvalidPostingsFile,
) -> Result<(), InvalidPostingsFile> {
    if posts.first() != Some(&0) {
        return Err(error(0));
    }
    if let Some(position) = (1..posts.len()).find(|&position| posts[position] < posts[position - 1])
    {
        return Err(error(position));
    }
    if posts.last() != Some(&close) {
        return Err(error(posts.len() - 1));
    }

    Ok(())
}

/// One type's membership over the base delivery order.
///
/// Borrowed from the mapped entries array at its stored representation.
#[derive(Debug, Copy, Clone)]
pub(crate) enum Membership<'map> {
    /// Base positions, strictly ascending.
    List(&'map [u32]),
    /// A dense bitmap over all `N` positions.
    ///
    /// `ceil(N/32)` words, LSB-first - position `p` is bit `p & 31` of word `p >> 5`.
    Dense(&'map [u32]),
}

impl Membership<'_> {
    /// Returns the number of member positions.
    #[must_use]
    pub(crate) fn count(&self) -> u64 {
        match self {
            Self::List(positions) => positions.len() as u64,
            Self::Dense(words) => words.iter().map(|&word| u64::from(word.count_ones())).sum(),
        }
    }

    /// Returns whether `position` is a member.
    #[must_use]
    pub(crate) fn contains(&self, position: u32) -> bool {
        match self {
            Self::List(positions) => positions.binary_search(&position).is_ok(),
            Self::Dense(words) => words
                .get(position as usize >> 5)
                .is_some_and(|&word| word & (1 << (position & 31)) != 0),
        }
    }

    /// Iterates the member positions inside `range`, ascending.
    ///
    /// The shape a delivered run's mask column interleaves from. An inverted range is empty.
    pub(crate) fn positions_in(&self, range: Range<u32>) -> MembershipPositions<'_> {
        let range = range.start..range.end.max(range.start);
        match *self {
            Self::List(positions) => {
                let start = positions.partition_point(|&position| position < range.start);
                let end = positions.partition_point(|&position| position < range.end);
                MembershipPositions::List(positions[start..end].iter())
            }
            Self::Dense(words) => MembershipPositions::Dense {
                words,
                position: u64::from(range.start),
                end: u64::from(range.end),
            },
        }
    }
}

/// Iterator over one membership's positions inside a range.
#[derive(Debug)]
pub(crate) enum MembershipPositions<'map> {
    /// The member slice of a list run.
    List(core::slice::Iter<'map, u32>),
    /// A cursor over a dense run's bits.
    ///
    /// The cursor is `u64` so the word-boundary jump cannot overflow at the top of the `u32`
    /// position domain.
    Dense {
        words: &'map [u32],
        position: u64,
        end: u64,
    },
}

impl Iterator for MembershipPositions<'_> {
    type Item = u32;

    fn next(&mut self) -> Option<u32> {
        match self {
            Self::List(positions) => positions.next().copied(),
            Self::Dense {
                words,
                position,
                end,
            } => {
                while *position < *end {
                    let word = words
                        [usize::try_from(*position >> 5).expect("words fit the address space")];
                    // Mask off the bits below the cursor, then jump to
                    // the next set bit inside this word, if any.
                    let masked = word & (u32::MAX << (*position & 31));
                    let next = (*position & !31) + u64::from(masked.trailing_zeros());
                    if masked != 0 && next < *end {
                        *position = next + 1;
                        return Some(u32::try_from(next).expect("positions below the end fit u32"));
                    }
                    if masked != 0 {
                        // The next set bit lies at or beyond the range.
                        break;
                    }
                    // Skip to the next word boundary.
                    *position = (*position & !31) + u64::from(u32::BITS);
                }
                None
            }
        }
    }
}
