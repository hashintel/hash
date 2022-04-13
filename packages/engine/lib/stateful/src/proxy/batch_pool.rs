use crate::{
    proxy::{PoolReadProxy, PoolWriteProxy},
    Result,
};

/// A pool is an ordered collection of batches.
///
/// Each group of agents within a simulation run is associated to a batch in the pool. Each
/// batch in a pool can either be borrowed as shared ([`read_proxies()`] and
/// [`partial_read_proxies()`] returning [`PoolReadProxy`]) or mutable reference
/// ([`write_proxies()`] and [`partial_write_proxies()`] returning [`PoolReadProxy`]).
///
/// [`read_proxies()`]: Self::read_proxies
/// [`partial_read_proxies()`]: Self::partial_read_proxies
/// [`write_proxies()`]: Self::write_proxies
/// [`partial_write_proxies()`]: Self::partial_write_proxies
pub trait BatchPool: Send + Sync {
    /// The underlying batch.
    type Batch;

    /// Returns the number of batches inside this pool.
    fn len(&self) -> usize;

    /// Returns true if there are no batches in this pool.
    fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Adds a batch at the end of this pool.
    ///
    /// Note, that unlike in `new()` this does not require the batch to be wrapped
    /// inside of [`Arc`]`<RwLock<B>>`.
    ///
    /// [`Arc`]: std::sync::Arc
    fn push(&mut self, batch: Self::Batch);

    /// Removes the batch at position `index` within the pool, shifting all elements after it to
    /// the left.
    ///
    /// Returns the removed batch.
    ///
    /// # Panics
    ///
    /// - If `index` is out of bounds, or
    /// - if the `Batch` is currently borrowed as a [`BatchReadProxy`] or [`BatchWriteProxy`].
    ///
    /// [`BatchReadProxy`]: crate::proxy::BatchReadProxy
    /// [`BatchWriteProxy`]: crate::proxy::BatchWriteProxy
    fn remove(&mut self, index: usize) -> Self::Batch;

    /// Removes the batch at position `index` within the pool and returns it.
    ///
    /// The removed batch is replaced by the last batch of the pool. This does not preserve
    /// ordering, but is `O(1)`. If you need to preserve the element order, use
    /// [`remove()`](Self::remove) instead.
    ///
    /// Returns the removed batch.
    ///
    /// # Panics
    ///
    /// - If `index` is out of bounds, or
    /// - if the `Batch` is currently borrowed as a [`BatchReadProxy`] or [`BatchWriteProxy`].
    ///
    /// [`BatchReadProxy`]: crate::proxy::BatchReadProxy
    /// [`BatchWriteProxy`]: crate::proxy::BatchWriteProxy
    fn swap_remove(&mut self, index: usize) -> Self::Batch;

    /// Creates a [`PoolReadProxy`] for _all_ batches within the pool.
    ///
    /// # Errors
    ///
    /// Returns [`Error::ProxySharedLock`] if any of the batches is currently borrowed in a
    /// [`BatchWriteProxy`].
    ///
    /// [`Error::ProxySharedLock`]: crate::Error::ProxySharedLock
    /// [`BatchWriteProxy`]: crate::proxy::BatchWriteProxy
    fn read_proxies(&self) -> Result<PoolReadProxy<Self::Batch>>;

    /// Creates a [`PoolReadProxy`] for a _selection_ of the batches within the pool, selected by
    /// the given `indices`.
    ///
    /// # Errors
    ///
    /// Returns [`Error::ProxySharedLock`] if any of the batches at one of the specified
    /// `indices` is currently borrowed in a [`BatchWriteProxy`].
    ///
    /// [`Error::ProxySharedLock`]: crate::Error::ProxySharedLock
    /// [`BatchWriteProxy`]: crate::proxy::BatchWriteProxy
    fn partial_read_proxies(&self, indices: &[usize]) -> Result<PoolReadProxy<Self::Batch>>;

    /// Creates a [`PoolWriteProxy`] for _all_ batches within the pool.
    ///
    /// # Errors
    ///
    /// Returns [`Error::ProxyExclusiveLock`] if any of the batches at one of the specified
    /// `indices` is currently borrowed either as [`BatchReadProxy`] or as [`BatchWriteProxy`].
    ///
    /// [`Error::ProxyExclusiveLock`]: crate::Error::ProxyExclusiveLock
    /// [`BatchReadProxy`]: crate::proxy::BatchReadProxy
    /// [`BatchWriteProxy`]: crate::proxy::BatchWriteProxy
    fn write_proxies(&mut self) -> Result<PoolWriteProxy<Self::Batch>>;

    /// Creates a [`PoolWriteProxy`] for a _selection_ of the batches within the pool, selected by
    /// the given `indices`.
    ///
    /// This can be used to create multiple mutable disjoint partitions of the pool.
    ///
    /// # Errors
    ///
    /// Returns [`Error::ProxyExclusiveLock`] if any of the batches at one of the specified
    /// `indices` is currently borrowed either as [`BatchReadProxy`] or as [`BatchWriteProxy`].
    ///
    /// [`Error::ProxyExclusiveLock`]: crate::Error::ProxyExclusiveLock
    /// [`BatchReadProxy`]: crate::proxy::BatchReadProxy
    /// [`BatchWriteProxy`]: crate::proxy::BatchWriteProxy
    fn partial_write_proxies(&mut self, indices: &[usize]) -> Result<PoolWriteProxy<Self::Batch>>;
}
