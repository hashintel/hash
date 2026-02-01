use core::ops::Index;

use super::Symbol;
use crate::{
    collections::FastHashMap,
    id::{Id, IdVec},
};

#[derive(Debug)]
enum SymbolLookupInner<'heap, I> {
    Dense(IdVec<I, Symbol<'heap>>),
    Gapped(IdVec<I, Option<Symbol<'heap>>>),
    Sparse(FastHashMap<I, Symbol<'heap>>),
}

/// A mapping from identifiers to symbols optimized for different access patterns.
///
/// [`SymbolTable`] provides efficient storage and retrieval of [`Symbol`] instances which are tied
/// to a specific identifier (which is any type that implements the [`Id`] trait).
///
/// # Storage Strategies
///
/// To accommodate different access patterns, [`SymbolTable`] supports three storage strategies:
///
/// ## Dense Storage
///
/// Created with [`SymbolTable::dense()`], this mode uses a [`Vec`] internally and requires
/// IDs to be inserted sequentially starting from 0. This provides optimal memory efficiency
/// and cache performance for contiguous ID ranges.
///
/// ## Gapped Storage
///
/// Created with [`SymbolTable::gapped()`], this mode uses a [`Vec`] of [`Option<Symbol>`]
/// internally and allows insertion at arbitrary indices. Unlike dense storage, gaps are allowed in
/// the ID sequence. This provides a balance between the memory efficiency of dense storage and the
/// flexibility of sparse storage, making it ideal for scenarios where most IDs are contiguous but
/// some gaps may exist.
///
/// ## Sparse Storage
///
/// Created with [`SymbolTable::sparse()`], this mode uses a [`FastHashMap`] internally and
/// supports arbitrary ID insertion order. This provides flexibility at the cost of higher
/// memory overhead per entry.
///
/// # Examples
///
/// ```
/// # use hashql_core::{heap::Heap, symbol::SymbolLookup, newtype, id::Id as _};
/// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
/// # let mut heap = Heap::new();
/// # let symbol = heap.intern_symbol("example");
/// // Dense storage for sequential IDs
/// let mut dense_table = SymbolLookup::<MyId>::dense();
/// dense_table.insert(MyId::from_u32(0), symbol);
/// assert_eq!(dense_table.get(MyId::from_u32(0)), Some(symbol));
///
/// // Gapped storage for mostly contiguous IDs with some gaps
/// let mut gapped_table = SymbolLookup::<MyId>::gapped();
/// gapped_table.insert(MyId::from_u32(0), symbol);
/// gapped_table.insert(MyId::from_u32(5), symbol); // Gap at IDs 1-4
/// assert_eq!(gapped_table.get(MyId::from_u32(0)), Some(symbol));
/// assert_eq!(gapped_table.get(MyId::from_u32(2)), None); // Gap
/// assert_eq!(gapped_table.get(MyId::from_u32(5)), Some(symbol));
///
/// // Sparse storage for arbitrary IDs
/// let mut sparse_table = SymbolLookup::<MyId>::sparse();
/// sparse_table.insert(MyId::from_u32(100), symbol);
/// assert_eq!(sparse_table.get(MyId::from_u32(100)), Some(symbol));
/// sparse_table.insert(MyId::from_u32(5), symbol);
/// assert_eq!(sparse_table.get(MyId::from_u32(5)), Some(symbol));
/// ```
#[derive(Debug)]
pub struct SymbolLookup<'heap, I> {
    inner: SymbolLookupInner<'heap, I>,
}

impl<'heap, I> SymbolLookup<'heap, I>
where
    I: Id,
{
    /// Creates a new symbol table using dense vector-based storage.
    ///
    /// Dense tables require sequential ID insertion starting from 0 and provide
    /// optimal memory efficiency and cache performance for contiguous ID ranges.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{symbol::SymbolLookup, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let table = SymbolLookup::<MyId>::dense();
    /// // Insertions must be sequential: 0, 1, 2, ...
    /// ```
    #[must_use]
    pub const fn dense() -> Self {
        Self {
            inner: SymbolLookupInner::Dense(IdVec::new()),
        }
    }

    /// Creates a new symbol table using gapped vector-based storage.
    ///
    /// Gapped tables allow insertion at arbitrary indices within a vector, automatically
    /// filling gaps with `None` values. This provides better memory locality than sparse
    /// tables while still allowing non-contiguous ID ranges.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{symbol::SymbolLookup, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let table = SymbolLookup::<MyId>::gapped();
    /// // Insertions can have gaps: 0, 5, 3, 10, ...
    /// ```
    #[must_use]
    pub const fn gapped() -> Self {
        Self {
            inner: SymbolLookupInner::Gapped(IdVec::new()),
        }
    }

    /// Creates a new symbol table using sparse hash-based storage.
    ///
    /// Sparse tables support arbitrary ID insertion order and provide flexibility
    /// for non-contiguous ID ranges at the cost of higher memory overhead per entry.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{symbol::SymbolLookup, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let table = SymbolLookup::<MyId>::sparse();
    /// // Insertions can be in any order: 100, 5, 1000, ...
    /// ```
    #[must_use]
    pub fn sparse() -> Self {
        Self {
            inner: SymbolLookupInner::Sparse(FastHashMap::default()),
        }
    }

    /// Inserts a symbol associated with the given identifier.
    ///
    /// - For dense tables, the `id` must be sequential starting from 0.
    /// - For gapped tables, any `id` value is accepted, and gaps will be filled with `None`.
    /// - For sparse tables, any `id` value is accepted.
    ///
    /// If the `id` already exists in a gapped or sparse table, the previous symbol is replaced.
    ///
    /// # Panics
    ///
    /// Panics if this is a dense table and the `id` is not sequential (i.e., not equal
    /// to the current length of the internal vector).
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, symbol::SymbolLookup, newtype, id::Id as _};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # let mut heap = Heap::new();
    /// # let symbol = heap.intern_symbol("example");
    /// let mut table = SymbolLookup::<MyId>::dense();
    /// table.insert(MyId::from_u32(0), symbol); // First insertion
    /// table.insert(MyId::from_u32(1), symbol); // Sequential insertion
    /// ```
    ///
    /// Non-sequential insertions will panic in dense tables:
    ///
    /// ```should_panic
    /// # use hashql_core::{heap::Heap, symbol::SymbolLookup, newtype, id::Id as _};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # let mut heap = Heap::new();
    /// # let symbol = heap.intern_symbol("example");
    /// let mut table = SymbolLookup::<MyId>::dense();
    /// table.insert(MyId::from_u32(0), symbol); // First insertion
    /// table.insert(MyId::from_u32(2), symbol); // Non-sequential insertion
    /// ```
    pub fn insert(&mut self, id: I, symbol: Symbol<'heap>) {
        match &mut self.inner {
            SymbolLookupInner::Dense(vec) => {
                assert_eq!(
                    id,
                    vec.bound(),
                    "insertions into dense symbol tables must be sequential and contiguous"
                );

                vec.push(symbol);
            }
            SymbolLookupInner::Gapped(vec) => {
                vec.insert(id, symbol);
            }
            SymbolLookupInner::Sparse(map) => {
                map.insert(id, symbol);
            }
        }
    }

    /// Retrieves the symbol associated with the given identifier.
    ///
    /// Returns the [`Symbol`] if the `id` exists in the table, or [`None`] if
    /// the `id` is not found or if the entry is a gap (in gapped tables).
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, symbol::SymbolLookup, newtype, id::Id as _};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # let mut heap = Heap::new();
    /// # let symbol = heap.intern_symbol("example");
    /// let mut table = SymbolLookup::<MyId>::sparse();
    /// table.insert(MyId::from_u32(42), symbol);
    ///
    /// assert_eq!(table.get(MyId::from_u32(42)), Some(symbol));
    /// assert_eq!(table.get(MyId::from_u32(99)), None);
    /// ```
    pub fn get(&self, id: I) -> Option<Symbol<'heap>> {
        match &self.inner {
            SymbolLookupInner::Dense(vec) => vec.get(id).copied(),
            SymbolLookupInner::Gapped(vec) => vec.get(id).copied().flatten(),
            SymbolLookupInner::Sparse(map) => map.get(&id).copied(),
        }
    }
}

impl<'heap, I> Index<I> for SymbolLookup<'heap, I>
where
    I: Id,
{
    type Output = Symbol<'heap>;

    fn index(&self, index: I) -> &Self::Output {
        match &self.inner {
            SymbolLookupInner::Dense(vec) => &vec[index],
            SymbolLookupInner::Gapped(vec) => vec[index].as_ref().expect("index out of bounds"),
            SymbolLookupInner::Sparse(map) => &map[&index],
        }
    }
}
