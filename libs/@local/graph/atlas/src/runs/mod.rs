//! Compressed runs of items over dense key domains.
//!
//! [`Runs`] is the shared form of a recurring artifact and pipeline shape: many
//! short item lists, one per key of a dense domain, stored as two flat columns.
//! The items column holds every list back to back in key order, and the
//! fencepost column records where each list begins, so key `i`'s list is the
//! contiguous stretch `items[posts[i]..posts[i + 1]]`. Storage stays two
//! allocations at any key count. A run borrows as one slice, and either column
//! writes to an artifact region as it is.
//!
//! # Vocabulary and invariants
//!
//! A run is one key's item list. The fencepost column carries one offset per
//! run plus a closing offset. It anchors at zero, never decreases, and closes
//! at the items column's length. Construction establishes these rules once,
//! so accessors index on them without rechecking.
//!
//! # Construction
//!
//! [`Runs::from_pairs`] counting-sorts unsorted `(key, item)` pairs into runs
//! in linear time. [`RunsBuilder`] appends whole runs when the producer
//! already visits keys in order. [`Runs::from_parts`] validates columns that
//! already exist.
//!
//! # Value columns
//!
//! Per-item values live in parallel columns beside the items column, never
//! inside it. [`Runs::span`] returns a run's index range, and slicing a
//! parallel column with it yields the values of exactly that run. One
//! structure thereby serves any number of aligned columns, and each column
//! stays a plain array in memory and on disk.
//!
//! # Sparse-matrix view
//!
//! The layout is the compressed-sparse-row structure with fenceposts as the
//! pointer column and items as the index column. [`Runs::structure_view`]
//! borrows both columns as a [`sprs`] structure-only matrix view without
//! copying, so sparse algebra stays reachable while signatures keep the typed
//! key and item domains.

#[cfg(test)]
mod tests;

use core::{fmt, ops::Range};

use hashql_core::id::{Id, IdSlice, IdVec};
use sprs::{CsMatViewI, CsStructureViewI, SpIndex, errors::StructureError};

/// Why two columns are not a valid run structure.
///
/// Each variant names one broken fencepost rule. The rules are structural,
/// and what the items mean stays the consumer's contract.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum RunsError {
    /// The fencepost column is empty, so not even an empty key domain exists.
    Missing,
    /// The first fencepost is not zero.
    Anchor,
    /// A fencepost is smaller than its predecessor.
    Order {
        /// The offending fencepost's position in the fencepost column.
        index: usize,
    },
    /// The last fencepost does not equal the items column's length.
    Close {
        /// The closing fencepost's value.
        post: usize,
        /// The items column's length.
        items: usize,
    },
}

impl fmt::Display for RunsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Missing => fmt.write_str("the fencepost column is empty"),
            Self::Anchor => fmt.write_str("the first fencepost is not zero"),
            Self::Order { index } => {
                write!(fmt, "fencepost {index} is smaller than its predecessor")
            }
            Self::Close { post, items } => write!(
                fmt,
                "the last fencepost {post} does not equal the item count {items}"
            ),
        }
    }
}

impl core::error::Error for RunsError {}

/// Items grouped into per-key runs over one shared column.
///
/// `I` is the key domain, dense ids sharing the [`Id`] contract, and `T` is
/// the item element. Key `i` owns the `i`-th run. The structure is immutable
/// after construction, and every run borrows from the one items allocation.
///
/// The fencepost column holds one offset per run plus a closing offset. It
/// anchors at zero, never decreases, and closes at the item count. Every
/// constructor establishes or validates these rules, so the accessors index
/// without rechecking them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Runs<I, T> {
    /// Fenceposts: one offset per run plus a closing offset equal to
    /// `items.len()`. The column anchors at zero and never decreases.
    posts: IdVec<I, usize>,
    /// Every run's items, back to back in key order.
    items: Box<[T]>,
}

impl<I, T> Runs<I, T>
where
    I: Id,
{
    /// Wraps existing fencepost and items columns as a validated structure.
    ///
    /// # Errors
    ///
    /// Returns the first violated rule: [`RunsError::Missing`] when the
    /// fencepost column is empty, [`RunsError::Anchor`] when the first
    /// fencepost is not zero, [`RunsError::Order`] when a fencepost is
    /// smaller than its predecessor, and [`RunsError::Close`] when the last
    /// fencepost does not equal the items column's length.
    pub(crate) fn from_parts(posts: Vec<usize>, items: Vec<T>) -> Result<Self, RunsError> {
        let Some((&first, _)) = posts.split_first() else {
            return Err(RunsError::Missing);
        };
        if first != 0 {
            return Err(RunsError::Anchor);
        }
        for index in 1..posts.len() {
            if posts[index] < posts[index - 1] {
                return Err(RunsError::Order { index });
            }
        }
        let last = posts[posts.len() - 1];
        if last != items.len() {
            return Err(RunsError::Close {
                post: last,
                items: items.len(),
            });
        }

        Ok(Self {
            posts: IdVec::from_raw(posts),
            items: items.into_boxed_slice(),
        })
    }

    /// Returns the run count: the key domain's size.
    #[inline]
    #[must_use]
    pub(crate) const fn runs(&self) -> usize {
        self.posts.len() - 1
    }

    /// Borrows the whole items column, every run back to back in key order.
    ///
    /// Its length is the total item count, which is also the length every
    /// parallel value column matches.
    #[inline]
    #[must_use]
    pub(crate) fn items(&self) -> &[T] {
        &self.items
    }

    /// Iterates the runs in key order.
    pub(crate) fn iter(&self) -> impl ExactSizeIterator<Item = (I, &[T])> + '_ {
        self.posts
            .array_windows_enumerated()
            .map(|(index, &[start, end])| (index, &self.items[start..end]))
    }

    /// Borrows the fencepost and items columns as raw slices.
    ///
    /// The fenceposts are usable directly as a file's pointer region and the
    /// items as its index or payload region. Reading runs goes through
    /// [`run`](Self::run) and [`span`](Self::span) instead.
    #[must_use]
    pub(crate) fn as_raw_parts(&self) -> (&IdSlice<I, usize>, &[T]) {
        (&self.posts, &self.items)
    }

    /// Counting-sorts `(key, item)` pairs into runs.
    ///
    /// The pairs arrive in any order over a key domain of `runs` keys. A run
    /// collects its key's pairs in arrival order, so a stream that ascends
    /// within each key yields runs that ascend. Time and memory are linear in
    /// the key and pair counts, over one counting pass, one prefix sum, and
    /// one placement pass.
    ///
    /// The constructor walks the iterator twice through its clone, once to
    /// count and once to place.
    ///
    /// # Panics
    ///
    /// This panics when a pair names a key at or beyond `runs`, and when the
    /// cloned iterator does not repeat its sequence.
    pub(crate) fn from_pairs(runs: usize, pairs: impl Iterator<Item = (I, T)> + Clone) -> Self
    where
        T: Copy,
    {
        let mut posts = vec![0_usize; runs + 1];
        for (key, _) in pairs.clone() {
            let index = key.as_usize();
            assert!(index < runs, "every pair names a key inside the domain");
            posts[index + 1] += 1;
        }

        for index in 1..posts.len() {
            posts[index] += posts[index - 1];
        }

        // The first pair's item seeds the whole buffer, and the placement
        // overwrites every slot when the two passes agree, which the closing
        // assertion checks, so no seeded value survives into the result.
        let mut items: Vec<T> = Vec::new();
        let mut cursors: IdVec<I, usize> = IdVec::from_raw(posts[..runs].to_vec());
        for (key, item) in pairs {
            if items.is_empty() {
                items = vec![item; posts[runs]];
            }
            let cursor = &mut cursors[key];
            items[*cursor] = item;
            *cursor += 1;
        }

        assert_eq!(
            cursors.as_raw(),
            &posts[1..],
            "the placement pass replays the counting pass's pairs"
        );

        Self {
            posts: IdVec::from_raw(posts),
            items: items.into_boxed_slice(),
        }
    }

    /// Returns run `key`'s index range in the items column.
    ///
    /// The range slices the columns riding beside the structure: a parallel
    /// column keeps one value per item, and indexing it with this range
    /// yields run `key`'s stretch of it.
    ///
    /// # Panics
    ///
    /// This panics when `key` is not below [`runs`](Self::runs).
    #[inline]
    #[must_use]
    pub(crate) fn span(&self, key: I) -> Range<usize> {
        self.posts[key]..self.posts[key.plus(1)]
    }

    /// Borrows run `key`: its items, contiguous in the shared column.
    ///
    /// # Panics
    ///
    /// This panics when `key` is not below [`runs`](Self::runs).
    #[inline]
    #[must_use]
    pub(crate) fn run(&self, key: I) -> &[T] {
        &self.items[self.span(key)]
    }
}

impl<I, T> Runs<I, T>
where
    I: Id,
    T: SpIndex,
{
    /// Borrows the structure as a compressed-sparse-row [`sprs`] view.
    ///
    /// The fenceposts serve as the pointer column and the items as the index
    /// column of a structure-only matrix with shape `(runs, columns)`. The
    /// borrow copies neither column. The view obeys sprs's matrix law, which
    /// is stricter than this type's: every run must ascend strictly, and
    /// every item must lie below `columns`.
    ///
    /// # Errors
    ///
    /// Returns the [`StructureError`] naming the first violated rule: a run
    /// that fails strict ascent, or an item at or beyond `columns`.
    pub(crate) fn structure_view(
        &self,
        columns: usize,
    ) -> Result<CsStructureViewI<'_, T, usize>, StructureError> {
        // SAFETY: a structure-only view's data column is `[()]`. Elements of `()` occupy zero
        // bytes, so `from_raw_parts` needs only a non-null pointer aligned for `()` and
        // `dangling()` provides one. The slice reads no memory during its borrow. Its total size
        // of zero cannot exceed `isize::MAX`.
        let data = unsafe { core::slice::from_raw_parts(core::ptr::dangling(), self.items.len()) };

        CsMatViewI::try_new(
            (self.runs(), columns),
            self.posts.as_raw(),
            &self.items,
            data,
        )
        .map_err(|(_, _, _, error)| error)
    }
}

/// Builds [`Runs`] one whole run at a time, in key order.
///
/// Each [`push_run`](Self::push_run) call appends one run and returns its key. The fenceposts
/// follow from the pushes alone, so the finished structure satisfies the fencepost rules by
/// construction and [`finish`](Self::finish) validates nothing.
#[derive(Debug)]
pub(crate) struct RunsBuilder<I, T> {
    /// Fenceposts so far: seeded with the zero anchor, one push per run.
    posts: IdVec<I, usize>,
    /// Items of every pushed run, back to back.
    items: Vec<T>,
}

impl<I, T> RunsBuilder<I, T>
where
    I: Id,
{
    /// Creates a builder with room for `runs` runs over `items` items.
    ///
    /// The counts are allocation hints. Pushing beyond either grows the columns.
    pub(crate) fn with_capacity(runs: usize, items: usize) -> Self {
        let mut posts = IdVec::with_capacity(runs + 1);
        posts.push(0);

        Self {
            posts,
            items: Vec::with_capacity(items),
        }
    }

    /// Appends the next run and returns its key.
    ///
    /// # Panics
    ///
    /// This panics when the finished run count leaves the key domain's encoding.
    pub(crate) fn push_run(&mut self, run: impl IntoIterator<Item = T>) -> I {
        self.items.extend(run);
        // The pushed fencepost closes the run, so its id sits one past the run's own key.
        self.posts.push(self.items.len()).minus(1)
    }

    /// Wraps the columns as the finished structure.
    #[must_use]
    pub(crate) fn finish(self) -> Runs<I, T> {
        Runs {
            posts: self.posts,
            items: self.items.into_boxed_slice(),
        }
    }
}
