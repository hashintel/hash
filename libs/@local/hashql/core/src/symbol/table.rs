use core::ops::Index;

use super::Symbol;
use crate::{collection::FastHashMap, id::Id};

#[derive(Debug)]
enum SymbolTableInner<'heap, I> {
    Dense(Vec<Symbol<'heap>>),
    Sparse(FastHashMap<I, Symbol<'heap>>),
}

/// A mapping from identifiers to symbols optimized for different access patterns.
///
/// [`SymbolTable`] provides efficient storage and retrieval of [`Symbol`] instances which are tied
/// to a specific identifier (which is any type that implements the [`Id`] trait).
///
/// # Storage Strategies
///
/// To accommodate different access patterns, [`SymbolTable`] supports two storage strategies:
///
/// ## Dense Storage
///
/// Created with [`SymbolTable::dense()`], this mode uses a [`Vec`] internally and requires
/// IDs to be inserted sequentially starting from 0. This provides optimal memory efficiency
/// and cache performance for contiguous ID ranges.
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
/// # use hashql_core::{heap::Heap, symbol::SymbolTable, newtype, id::Id as _};
/// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
/// # let mut heap = Heap::new();
/// # let symbol = heap.intern_symbol("example");
/// // Dense storage for sequential IDs
/// let mut dense_table = SymbolTable::<MyId>::dense();
/// dense_table.insert(MyId::from_u32(0), symbol);
/// assert_eq!(dense_table.get(MyId::from_u32(0)), Some(symbol));
///
/// // Sparse storage for arbitrary IDs
/// let mut sparse_table = SymbolTable::<MyId>::sparse();
/// sparse_table.insert(MyId::from_u32(100), symbol);
/// assert_eq!(sparse_table.get(MyId::from_u32(100)), Some(symbol));
/// sparse_table.insert(MyId::from_u32(5), symbol);
/// assert_eq!(sparse_table.get(MyId::from_u32(5)), Some(symbol));
/// ```
#[derive(Debug)]
pub struct SymbolTable<'heap, I> {
    inner: SymbolTableInner<'heap, I>,
}

impl<'heap, I> SymbolTable<'heap, I>
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
    /// # use hashql_core::{symbol::SymbolTable, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let table = SymbolTable::<MyId>::dense();
    /// // Insertions must be sequential: 0, 1, 2, ...
    /// ```
    #[must_use]
    pub const fn dense() -> Self {
        Self {
            inner: SymbolTableInner::Dense(Vec::new()),
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
    /// # use hashql_core::{symbol::SymbolTable, newtype};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// let table = SymbolTable::<MyId>::sparse();
    /// // Insertions can be in any order: 100, 5, 1000, ...
    /// ```
    #[must_use]
    pub fn sparse() -> Self {
        Self {
            inner: SymbolTableInner::Sparse(FastHashMap::default()),
        }
    }

    /// Inserts a symbol associated with the given identifier.
    ///
    /// For dense tables, the `id` must be sequential starting from 0. For sparse tables,
    /// any `id` value is accepted. If the `id` already exists in a sparse table,
    /// the previous symbol is replaced.
    ///
    /// # Panics
    ///
    /// Panics if this is a dense table and the `id` is not sequential (i.e., not equal
    /// to the current length of the internal vector).
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, symbol::SymbolTable, newtype, id::Id as _};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # let mut heap = Heap::new();
    /// # let symbol = heap.intern_symbol("example");
    /// let mut table = SymbolTable::<MyId>::dense();
    /// table.insert(MyId::from_u32(0), symbol); // First insertion
    /// table.insert(MyId::from_u32(1), symbol); // Sequential insertion
    /// ```
    ///
    /// Non-sequential insertions will panic:
    ///
    /// ```should_panic
    /// # use hashql_core::{heap::Heap, symbol::SymbolTable, newtype, id::Id as _};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # let mut heap = Heap::new();
    /// # let symbol = heap.intern_symbol("example");
    /// let mut table = SymbolTable::<MyId>::dense();
    /// table.insert(MyId::from_u32(0), symbol); // First insertion
    /// table.insert(MyId::from_u32(2), symbol); // Non-sequential insertion
    /// ```
    pub fn insert(&mut self, id: I, symbol: Symbol<'heap>) {
        match &mut self.inner {
            SymbolTableInner::Dense(vec) => {
                assert_eq!(
                    id.as_usize(),
                    vec.len(),
                    "insertions into dense symbol tables must be sequential and contiguous"
                );

                vec.push(symbol);
            }
            SymbolTableInner::Sparse(map) => {
                map.insert(id, symbol);
            }
        }
    }

    /// Retrieves the symbol associated with the given identifier.
    ///
    /// Returns the [`Symbol`] if the `id` exists in the table, or [`None`] if
    /// the `id` is not found.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::{heap::Heap, symbol::SymbolTable, newtype, id::Id as _};
    /// # newtype!(struct MyId(u32 is 0..=0xFFFF_FF00));
    /// # let mut heap = Heap::new();
    /// # let symbol = heap.intern_symbol("example");
    /// let mut table = SymbolTable::<MyId>::sparse();
    /// table.insert(MyId::from_u32(42), symbol);
    ///
    /// assert_eq!(table.get(MyId::from_u32(42)), Some(symbol));
    /// assert_eq!(table.get(MyId::from_u32(99)), None);
    /// ```
    pub fn get(&self, id: I) -> Option<Symbol<'heap>> {
        match &self.inner {
            SymbolTableInner::Dense(vec) => vec.get(id.as_usize()).copied(),
            SymbolTableInner::Sparse(map) => map.get(&id).copied(),
        }
    }
}

impl<'heap, I> Index<I> for SymbolTable<'heap, I>
where
    I: Id,
{
    type Output = Symbol<'heap>;

    fn index(&self, index: I) -> &Self::Output {
        match &self.inner {
            SymbolTableInner::Dense(vec) => &vec[index.as_usize()],
            SymbolTableInner::Sparse(map) => &map[&index],
        }
    }
}
