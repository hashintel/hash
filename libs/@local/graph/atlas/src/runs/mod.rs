//! Packed variable-length lists indexed by dense keys.
//!
//! [`Runs`] stores each key's list, called a run, in a shared items column. An offset column
//! locates the runs without allocating a separate buffer for each key. [`RunsView`] borrows the
//! same representation, including from mapped artifact regions.
//!
//! # Representation
//!
//! The offset column, `posts`, contains one start offset per run and a final end offset. Key `i`
//! selects `items[posts[i]..posts[i + 1]]`. Equal adjacent offsets represent an empty run.
//!
//! For example, `posts = [0, 2, 2, 5]` and `items = [4, 7, 1, 6, 8]` represent the runs `[4, 7]`,
//! `[]` and `[1, 6, 8]` at keys 0, 1 and 2.
//!
//! Valid offsets start at zero, never decrease, and end at the items column's length. An empty key
//! domain still has the offset column `[0]`. Offsets are little-endian 64-bit values, ready for
//! writing to an artifact region.
//!
//! # Construction
//!
//! - Use [`Runs::from_pairs`] to group `(key, item)` pairs supplied in any order.
//! - Use [`RunsBuilder`] to append whole runs in key order.
//! - Use [`Runs::from_parts`] or [`RunsView::from_parts`] to validate existing columns.
//!
//! # Parallel columns
//!
//! [`Runs::span`] returns a run's range of item positions. Apply that range to any parallel column
//! with one value per item, such as weights paired with neighbour IDs. The columns can remain
//! separate arrays in memory and on disk while sharing the same run boundaries.

#[cfg(test)]
mod tests;

use core::{fmt, ops::Range};

use hashql_core::id::{Id, IdSlice, IdVec};
use zerocopy::{LE, U64};

/// An invalid boundary in a packed list representation.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum RunsError {
    /// The offset column is empty, lacking the zero offset required even for no runs.
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

/// Checks that the offsets partition exactly `items` elements into runs.
///
/// # Errors
///
/// Returns [`RunsError`] for invalid offsets, with the same check order as [`Runs::from_parts`].
fn validate_posts(posts: &[U64<LE>], items: u64) -> Result<(), RunsError> {
    // an empty key domain has one offset, serving as both the start and end.
    let &[first, ..] = posts else {
        return Err(RunsError::Missing);
    };

    if first.get() != 0 {
        return Err(RunsError::Anchor);
    }

    // equal offsets allow empty runs. The decreasing offset is the window's second element.
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

/// Immutable per-key lists stored in shared offset and item columns.
///
/// `I` numbers the runs from zero under the [`Id`] contract. Every constructor establishes the
/// offset invariants described in the [module documentation](crate::runs). Lookup borrows a
/// contiguous slice without allocating or rescanning the offsets.
///
/// Keys supplied for lookup must convert losslessly to [`usize`]. Direct lookup also requires `I`
/// to represent the key's successor, which indexes the run's end offset.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Runs<I, T> {
    /// Fenceposts: one offset per run plus a closing offset equal to `items.len()`.
    ///
    /// The column anchors at zero and never decreases.
    posts: IdVec<I, U64<LE>>,
    /// Every run's items, back to back in key order.
    items: Box<[T]>,
}

impl<I, T> Runs<I, T>
where
    I: Id,
{
    /// Returns the number of keys, including keys with empty runs.
    #[inline]
    #[must_use]
    pub(crate) const fn runs(&self) -> usize {
        self.posts.len() - 1
    }

    /// Validates and takes ownership of existing offset and item columns.
    ///
    /// # Errors
    ///
    /// Returns [`RunsError`] for invalid offsets, in the order [`Missing`](RunsError::Missing),
    /// [`Anchor`](RunsError::Anchor), [`Order`](RunsError::Order), [`Close`](RunsError::Close).
    pub(crate) fn from_parts(posts: IdVec<I, U64<LE>>, items: Vec<T>) -> Result<Self, RunsError> {
        validate_posts(posts.as_raw(), items.len() as u64)?;

        Ok(Self {
            posts,
            items: items.into_boxed_slice(),
        })
    }

    /// Borrows all items in key order.
    ///
    /// Every parallel value column must match this slice's length and item order.
    #[inline]
    #[must_use]
    pub(crate) fn items(&self) -> &[T] {
        &self.items
    }

    /// Iterates the runs in key order.
    ///
    /// # Panics
    ///
    /// Creating or advancing the iterator panics if `I` cannot represent a run index. An empty
    /// domain also requires `I` to represent zero.
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

    /// Borrows the stored columns for serialization.
    ///
    /// The offsets retain their little-endian representation. Use [`run`](Self::run) or
    /// [`span`](Self::span) to look up an individual key.
    #[must_use]
    pub(crate) fn as_raw_parts(&self) -> (&IdSlice<I, U64<LE>>, &[T]) {
        (&self.posts, &self.items)
    }

    /// Groups unordered pairs into runs while preserving each key's item order.
    ///
    /// Keys cover `0..runs`, including empty runs for keys absent from `pairs`. A clone of the
    /// iterator supplies the per-key counts. The original iterator supplies the items and their
    /// order within each run. Both iterations must yield the same number of items per key.
    ///
    /// # Complexity
    ///
    /// For `n` pairs, construction takes O(`runs` + `n`) time and space. Counting sort uses a
    /// counting pass, a prefix sum over keys, and a placement pass over the pairs.
    ///
    /// # Panics
    ///
    /// Panics if either iteration names a key outside `0..runs` or the per-key counts differ. The
    /// key type must represent every index in `0..=runs` and also `1` for an empty domain. Keys
    /// must meet [`Runs`]'s lossless-conversion requirement.
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

        // prefix sums turn per-key counts into end offsets, retaining zero as the first start.
        for index in posts.ids().skip(1) {
            let prev = posts[index.minus(1)];
            posts[index] += prev;
        }

        // initialize with an actual item to avoid uninitialized storage. Placement replaces every
        // slot when the per-key counts agree, which the final cursor comparison checks.
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

    /// Returns the item positions belonging to `key`.
    ///
    /// The range also selects exactly this run's values from any aligned parallel column.
    ///
    /// # Panics
    ///
    /// Panics when `key` is not below [`runs`](Self::runs), or when `I` cannot represent its
    /// successor. Keys must meet [`Runs`]'s lossless-conversion requirement.
    #[inline]
    #[must_use]
    pub(crate) fn span(&self, key: I) -> Range<usize> {
        let start =
            usize::try_from(self.posts[key].get()).expect("resident entries fit the address space");
        let end = usize::try_from(self.posts[key.plus(1)].get())
            .expect("resident entries fit the address space");

        start..end
    }

    /// Borrows the items belonging to `key`.
    ///
    /// # Panics
    ///
    /// Panics under the key conditions of [`Self::span`], including an unrepresentable successor.
    #[inline]
    #[must_use]
    pub(crate) fn run(&self, key: I) -> &[T] {
        &self.items[self.span(key)]
    }
}

/// Per-key lists borrowed from existing offset and item columns.
///
/// The columns have the same representation and lookup requirements as [`Runs`]. Item borrows
/// retain the columns' lifetime and can outlive the view itself.
///
/// For mapped artifacts, use [`from_parts`](Self::from_parts) to validate the regions when opening
/// the file. [`from_parts_unchecked`](Self::from_parts_unchecked) can reconstruct the view over
/// those unchanged regions for later reads. The mapping owner can then return run slices without
/// storing a self-referential view.
#[derive(Debug, Clone, Copy)]
pub(crate) struct RunsView<'map, I, T> {
    /// Fenceposts: one offset per run plus a closing offset equal to `items.len()`.
    ///
    /// The column anchors at zero and never decreases.
    posts: &'map IdSlice<I, U64<LE>>,
    /// Every run's items, back to back in key order.
    items: &'map [T],
}

impl<'map, I, T> RunsView<'map, I, T>
where
    I: Id,
{
    /// Validates and borrows existing offset and item columns.
    ///
    /// # Errors
    ///
    /// Returns [`RunsError`] for invalid offsets, with the same check order as
    /// [`Runs::from_parts`].
    pub(crate) fn from_parts(posts: &'map [U64<LE>], items: &'map [T]) -> Result<Self, RunsError> {
        validate_posts(posts, items.len() as u64)?;

        Ok(Self {
            posts: IdSlice::from_raw(posts),
            items,
        })
    }

    /// Borrows offset and item columns whose run boundaries already passed validation.
    ///
    /// `posts` and `items` must be the exact pair that passed [`Self::from_parts`]. The validated
    /// fenceposts and item count must remain unchanged.
    // the fencepost invariant concerns correctness rather than memory safety
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

    /// Borrows all items in key order for the columns' lifetime.
    #[inline]
    #[must_use]
    pub(crate) const fn items(&self) -> &'map [T] {
        self.items
    }

    /// Borrows the items belonging to `key` for the columns' lifetime.
    ///
    /// # Panics
    ///
    /// Panics when `key` is not below the view's run count, or when `I` cannot represent its
    /// successor. Keys must meet [`Runs`]'s lossless-conversion requirement. Invalid columns
    /// supplied through [`Self::from_parts_unchecked`] can also panic during fencepost conversion
    /// or slicing.
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
    ///
    /// # Panics
    ///
    /// Creating or advancing the iterator panics if `I` cannot represent a run index. An empty
    /// domain also requires `I` to represent zero. Invalid columns supplied through
    /// [`Self::from_parts_unchecked`] can panic during fencepost conversion or slicing.
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

/// An append-only builder for per-key lists.
///
/// Each [`push_run`](Self::push_run) assigns the next key, starting at zero. Push an empty iterator
/// for a key with no items. [`finish`](Self::finish) makes the accumulated lists available as
/// immutable [`Runs`].
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
    /// Reserves space for `runs` lists containing `items` items in total.
    ///
    /// The counts are capacity hints. Pushing beyond either grows the columns.
    ///
    /// # Panics
    ///
    /// Panics if `I` cannot represent zero.
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
    /// Panics if `I` cannot represent the new run count, which indexes the closing offset.
    pub(crate) fn push_run(&mut self, run: impl IntoIterator<Item = T>) -> I {
        self.items.extend(run);
        // the end offset has the next key's index.
        self.posts.push(U64::new(self.items.len() as u64)).minus(1)
    }

    /// Makes the accumulated runs available for indexed lookup.
    #[must_use]
    pub(crate) fn finish(self) -> Runs<I, T> {
        Runs {
            posts: self.posts,
            items: self.items.into_boxed_slice(),
        }
    }
}
