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
//! # Mapped artifacts
//!
//! [`RunsView`] is the borrowed counterpart over a mapped artifact's regions:
//! the same fencepost law over columns a read-only file mapping owns, with
//! the fenceposts at their persisted little-endian width.

#[cfg(test)]
mod tests;

use core::{fmt, ops::Range};

use hashql_core::id::{Id, IdSlice, IdVec};
use zerocopy::{LE, U64};

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
        post: u64,
        /// The items column's length.
        items: u64,
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

/// Checks the fencepost law over one post column: anchored at zero, never
/// decreasing, closing at `items`.
fn validate_posts(posts: &[U64<LE>], items: u64) -> Result<(), RunsError> {
    // `[first, ..]` rather than `[first, .., last]`: the lone anchoring post of an empty key
    // domain is a valid column, and it is its own closing post.
    let &[first, ..] = posts else {
        return Err(RunsError::Missing);
    };

    if first.get() != 0 {
        return Err(RunsError::Anchor);
    }

    // Strict `>` only: equal neighbouring posts are exactly how an empty run is spelled. The
    // window at `index` pairs a post with its successor, so the offending post - the one smaller
    // than its predecessor - sits at `index + 1`.
    if let Some(index) = posts
        .array_windows::<2>()
        .position(|&[lhs, rhs]| lhs.get() > rhs.get())
    {
        return Err(RunsError::Order { index: index + 1 });
    }

    let close = posts[posts.len() - 1].get();
    if close != items {
        return Err(RunsError::Close { post: close, items });
    }

    Ok(())
}

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
    posts: IdVec<I, U64<LE>>,
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
    pub(crate) fn from_parts(posts: IdVec<I, U64<LE>>, items: Vec<T>) -> Result<Self, RunsError> {
        validate_posts(posts.as_raw(), items.len() as u64)?;

        Ok(Self {
            posts,
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
            .windows_enumerated()
            .map(|(index, &[start, end])| {
                let start =
                    usize::try_from(start.get()).expect("resident entries fit the address space");
                let end =
                    usize::try_from(end.get()).expect("resident entries fit the address space");

                (index, &self.items[start..end])
            })
    }

    /// Borrows the fencepost and items columns as raw slices.
    ///
    /// The fenceposts are usable directly as a file's pointer region and the
    /// items as its index or payload region. Reading runs goes through
    /// [`run`](Self::run) and [`span`](Self::span) instead.
    #[must_use]
    pub(crate) fn as_raw_parts(&self) -> (&IdSlice<I, U64<LE>>, &[T]) {
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
        let mut posts = IdVec::from_elem(U64::new(0), runs + 1);
        for (key, _) in pairs.clone() {
            let index = key.as_usize();
            assert!(index < runs, "every pair names a key inside the domain");
            posts[key.plus(1)] += 1;
        }

        // The anchor at id 0 stays zero. Every later post accumulates its predecessor.
        for index in posts.ids().skip(1) {
            let prev = posts[index.minus(1)];
            posts[index] += prev;
        }

        // The first pair's item seeds the whole buffer, and the placement
        // overwrites every slot when the two passes agree, which the closing
        // assertion checks, so no seeded value survives into the result.
        let mut items: Vec<T> = Vec::new();
        let mut cursors = posts.prefix(I::from_usize(runs)).to_vec();
        for (key, item) in pairs {
            if items.is_empty() {
                let total = usize::try_from(posts[I::from_usize(runs)].get())
                    .expect("resident entries fit the address space");
                items = vec![item; total];
            }

            let cursor = &mut cursors[key];
            let slot =
                usize::try_from(cursor.get()).expect("resident entries fit the address space");
            items[slot] = item;
            *cursor += 1;
        }

        assert_eq!(
            cursors.as_raw(),
            &posts[I::from_usize(1)..],
            "the placement pass replays the counting pass's pairs"
        );

        Self {
            posts,
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
        let start =
            usize::try_from(self.posts[key].get()).expect("resident entries fit the address space");
        let end = usize::try_from(self.posts[key.plus(1)].get())
            .expect("resident entries fit the address space");

        start..end
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

/// Runs borrowed from a mapped artifact's fencepost and items regions.
///
/// The borrowed counterpart of [`Runs`]: the same fencepost law over columns
/// a read-only file mapping owns, with the fenceposts at their persisted
/// little-endian width. [`RunsView::from_parts`] validates the law where an
/// artifact opens, and [`RunsView::from_parts_unchecked`] re-borrows the same
/// regions afterwards, so an archive that owns its mapping serves runs
/// without storing a self-referential view.
#[derive(Debug, Clone, Copy)]
pub(crate) struct RunsView<'map, I, T> {
    /// Fenceposts: one offset per run plus a closing offset equal to
    /// `items.len()`. The column anchors at zero and never decreases.
    posts: &'map IdSlice<I, U64<LE>>,
    /// Every run's items, back to back in key order.
    items: &'map [T],
}

impl<'map, I, T> RunsView<'map, I, T>
where
    I: Id,
{
    /// Wraps mapped fencepost and items columns as a validated view.
    ///
    /// # Errors
    ///
    /// Returns the first violated rule, exactly as [`Runs::from_parts`]
    /// reports it: [`RunsError::Missing`], [`RunsError::Anchor`],
    /// [`RunsError::Order`], or [`RunsError::Close`].
    pub(crate) fn from_parts(posts: &'map [U64<LE>], items: &'map [T]) -> Result<Self, RunsError> {
        validate_posts(posts, items.len() as u64)?;

        Ok(Self {
            posts: IdSlice::from_raw(posts),
            items,
        })
    }

    /// Re-wraps columns [`Self::from_parts`] validated when the artifact
    /// opened.
    ///
    /// The caller owns the proof that this exact pair passed validation. The
    /// debug assertions catch the realistic misuse - one region's fenceposts
    /// paired with another's items - through the anchor and close rules.
    #[must_use]
    pub(crate) fn from_parts_unchecked(posts: &'map [U64<LE>], items: &'map [T]) -> Self {
        debug_assert_eq!(
            posts.first().map(|post| post.get()),
            Some(0),
            "the fencepost column anchors at zero",
        );
        debug_assert_eq!(
            posts.last().map(|post| post.get()),
            Some(items.len() as u64),
            "the fencepost column closes at the item count",
        );

        Self {
            posts: IdSlice::from_raw(posts),
            items,
        }
    }

    /// Returns the run count: the key domain's size.
    #[inline]
    #[must_use]
    pub(crate) const fn runs(&self) -> usize {
        self.posts.len() - 1
    }

    /// Borrows the whole items column, every run back to back in key order.
    #[inline]
    #[must_use]
    pub(crate) const fn items(&self) -> &'map [T] {
        self.items
    }

    /// Borrows run `key`: its items, contiguous in the mapped column.
    ///
    /// The borrow carries the mapping's lifetime rather than the view's, so a
    /// run outlives the view value that served it.
    ///
    /// # Panics
    ///
    /// This panics when `key` is not below [`runs`](Self::runs).
    #[inline]
    #[must_use]
    pub(crate) fn run(&self, key: I) -> &'map [T] {
        let start =
            usize::try_from(self.posts[key].get()).expect("mapped entries fit the address space");
        let end = usize::try_from(self.posts[key.plus(1)].get())
            .expect("mapped entries fit the address space");

        &self.items[start..end]
    }

    /// Iterates the runs in key order.
    pub(crate) fn iter(&self) -> impl ExactSizeIterator<Item = (I, &'map [T])> + '_ {
        let items = self.items;
        self.posts
            .windows_enumerated()
            .map(move |(index, &[start, end])| {
                let start =
                    usize::try_from(start.get()).expect("mapped entries fit the address space");
                let end = usize::try_from(end.get()).expect("mapped entries fit the address space");

                (index, &items[start..end])
            })
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
    posts: IdVec<I, U64<LE>>,
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
        posts.push(U64::new(0));

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
        self.posts.push(U64::new(self.items.len() as u64)).minus(1)
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
