//! Identity-table extensions: rows the delta allocates past a generation's baked bound.
//!
//! A generation's identity tables are immutable files, and the delta observes identities the fit
//! never saw. Each row domain the delta grows gets one overlay, which owns everything past the
//! baked bound - the allocated identities' rows with their reverse index - and derives the
//! accepted universe the two sides span. Rows below the bound stay the generation's own, so a
//! lookup composes the table's answer with the overlay's and a reader learns nothing about which
//! side answered.
//!
//! Growth is the register's alone. [`IdentityTableOverlay::resolve`] hands an identity its row,
//! allocating the next row past the current universe on first sight, so the extension is dense,
//! insert-only, and reproducible from its allocation order. Publication clones the overlay into
//! the snapshot, which freezes the extension for every read taken against that publication.

use hashql_core::{
    collections::{FastHashMap, fast_hash_map},
    id::Id,
};

use crate::serve::codec::Universe;

/// One row domain's extension past its baked identity table.
///
/// The bound at construction is the baked table's length, and every allocation grows the
/// universe by one row, so [`universe`](Self::universe) always spans the baked rows and the
/// allocated rows with no second counter. The identity type `K` matches the table this overlay
/// extends, and the row type `R` names the domain.
#[derive(Debug, Clone)]
pub(crate) struct IdentityTableOverlay<K, R> {
    /// The accepted row universe, the baked bound grown by one per allocation.
    universe: Universe<R>,
    /// The allocated identities' rows, keyed by identity.
    delta: FastHashMap<K, R>,
    /// The allocated identities in allocation order, indexed by row past the baked bound.
    delta_reverse: Vec<K>,
}

impl<K, R> IdentityTableOverlay<K, R>
where
    K: Copy + Eq + core::hash::Hash,
    R: Id,
{
    /// Opens the overlay past `bound` with an empty extension.
    pub(crate) fn new(bound: Universe<R>) -> Self {
        Self {
            universe: bound,
            delta: fast_hash_map(),
            delta_reverse: Vec::new(),
        }
    }

    /// Returns the allocated row carrying `id`, or [`None`] when no allocation holds it.
    ///
    /// The baked rows answer from the generation's own table, so a caller resolving across both
    /// sides consults the table first and this second.
    #[must_use]
    pub(crate) fn row_of(&self, id: K) -> Option<R> {
        self.delta.get(&id).copied()
    }

    /// Returns the identity of the allocated row `row`, or [`None`] outside the extension.
    ///
    /// Rows below the baked bound answer [`None`] here and their identity from the generation's
    /// own table, so the two sides partition the universe.
    #[must_use]
    pub(crate) fn id_of(&self, row: R) -> Option<K> {
        let bound = self.bound();
        let index = usize::try_from(row.as_u64().checked_sub(bound)?).ok()?;
        self.delta_reverse.get(index).copied()
    }

    /// Returns the row carrying `id`, allocating the next row past the universe on first sight.
    ///
    /// [`None`] is the row domain's own end: the id type has no next value to allocate. The wire
    /// codec's `u32` row domain is narrower, and its holder enforces it at the allocation call
    /// site, because domains this type serves without a wire codec carry no such bound.
    pub(crate) fn resolve(&mut self, id: K) -> Option<R> {
        if let Some(row) = self.row_of(id) {
            return Some(row);
        }

        let (universe, row) = self.universe.grow()?;
        self.universe = universe;
        self.delta.insert(id, row);
        self.delta_reverse.push(id);
        Some(row)
    }

    /// Returns the accepted row universe: the baked rows and every allocated row.
    #[must_use]
    pub(crate) const fn universe(&self) -> Universe<R> {
        self.universe
    }

    /// Returns the allocated identities beside their rows, in allocation order.
    pub(crate) fn allocated(&self) -> impl Iterator<Item = (R, K)> + '_ {
        let bound = self.bound();
        self.delta_reverse
            .iter()
            .enumerate()
            .map(move |(index, &id)| (R::from_u64(bound + index as u64), id))
    }

    /// Estimates the extension's resident bytes: the forward map and the reverse index.
    #[must_use]
    pub(crate) fn resident_estimate(&self) -> usize {
        self.delta.allocation_size() + self.delta_reverse.capacity() * size_of::<K>()
    }

    /// Returns the baked bound: the first row the extension may hold.
    const fn bound(&self) -> u64
    where
        R: [const] Id,
    {
        self.universe.size() as u64 - self.delta_reverse.len() as u64
    }
}

impl<K, R> PartialEq for IdentityTableOverlay<K, R>
where
    K: Copy + Eq + core::hash::Hash,
    R: Id,
{
    fn eq(&self, other: &Self) -> bool {
        self.universe == other.universe
            && self.delta_reverse == other.delta_reverse
            && self.delta == other.delta
    }
}
