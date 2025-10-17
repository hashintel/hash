//! Object pooling primitives for efficient resource management.
//!
//! This module provides a generic object pool implementation that allows for efficient
//! reuse of expensive-to-create objects. The pool system is built around the [`Recycler`]
//! trait, which defines how objects are cleaned up, created, and prepared for reuse.
//!
//! The primary benefit of object pooling is reducing allocation overhead by reusing
//! objects instead of constantly allocating and deallocating them. This is particularly
//! valuable for objects that are:
//! - Expensive to allocate (e.g., large vectors, complex data structures)
//! - Used frequently in hot code paths
//! - Short-lived but numerous
//!
//! # Architecture
//!
//! The pooling system consists of three main components:
//!
//! 1. [`Pool<T, R>`] - The main pool structure that manages object storage and lifecycle
//! 2. [`Recycler<T>`] - A trait that defines how to clean, create, and prepare objects
//! 3. Concrete recyclers like [`VecRecycler`] and [`MixedBitSetRecycler`]
//!
//! # Examples
//!
//! Basic usage with vector pooling:
//!
//! ```
//! use hashql_core::collections::pool::{VecPool, VecRecycler};
//!
//! let mut pool = VecPool::<i32>::new(10); // Pool with capacity of 10
//!
//! // Acquire a vector with initial capacity of 100
//! let mut vec = pool.acquire_with(100);
//! vec.extend([1, 2, 3, 4, 5]);
//!
//! // Use the vector...
//! assert_eq!(vec.len(), 5);
//!
//! // Return it to the pool for reuse
//! pool.release(vec);
//!
//! // Next acquisition will reuse the same vector (now cleared)
//! let vec2 = pool.acquire_with(50);
//! assert_eq!(vec2.len(), 0);
//! ```

use crate::id::{Id, bit_vec::MixedBitSet};

/// Trait for defining how objects are recycled, created, and prepared in a pool.
///
/// This trait provides the core lifecycle management for pooled objects. Implementors
/// define how to clean objects for reuse, create new objects when the pool is empty,
/// and prepare existing objects with specific configurations.
///
/// The `Config` associated type allows for parameterized object creation and preparation,
/// enabling pools to handle objects that need different initialization parameters.
///
/// # Implementation Guidelines
///
/// When implementing this trait:
/// - [`recycle`] should reset the object to a clean, reusable state
/// - [`acquire`] should create a new object with the given configuration
/// - [`prepare`] should configure an existing object for reuse with new parameters
///
/// # Examples
///
/// Implementing a recycler for a custom data structure:
///
/// ```
/// use hashql_core::collections::pool::Recycler;
///
/// #[derive(Debug)]
/// struct MyBuffer {
///     data: Vec<u8>,
///     threshold: usize,
/// }
///
/// #[derive(Debug, Default)]
/// struct MyBufferRecycler;
///
/// impl Recycler<MyBuffer> for MyBufferRecycler {
///     type Config = usize;
///
///     // threshold parameter
///
///     fn recycle(&mut self, item: &mut MyBuffer) {
///         item.data.clear(); // Reset data but preserve capacity
///     }
///
///     fn acquire(&mut self, threshold: usize) -> MyBuffer {
///         MyBuffer {
///             data: Vec::with_capacity(threshold * 2),
///             threshold,
///         }
///     }
///
///     fn prepare(&mut self, item: &mut MyBuffer, threshold: usize) {
///         item.threshold = threshold;
///         // Ensure adequate capacity for new threshold
///         if item.data.capacity() < threshold * 2 {
///             item.data.reserve(threshold * 2 - item.data.capacity());
///         }
///     }
/// }
/// ```
pub trait Recycler<T> {
    /// Configuration type used for object creation and preparation.
    ///
    /// This associated type allows recyclers to accept parameters when creating
    /// or preparing objects. Use `()` for recyclers that don't need configuration.
    type Config;

    /// Resets an object to a clean state suitable for reuse.
    ///
    /// This method is called before returning an object to the pool's free list.
    /// It should clear any state that would interfere with future use while
    /// preserving expensive allocations when possible.
    ///
    /// # Examples
    ///
    /// For a vector, this typically means clearing contents but keeping capacity:
    ///
    /// ```
    /// # use hashql_core::collections::pool::Recycler;
    /// # struct MyRecycler;
    /// # impl Recycler<Vec<i32>> for MyRecycler {
    /// #     type Config = ();
    /// fn recycle(&mut self, item: &mut Vec<i32>) {
    ///     item.clear(); // Remove all elements but preserve capacity
    /// }
    /// #     fn acquire(&mut self, _: ()) -> Vec<i32> { Vec::new() }
    /// #     fn prepare(&mut self, _: &mut Vec<i32>, _: ()) {}
    /// # }
    /// ```
    fn recycle(&mut self, item: &mut T);

    /// Creates a new object when the pool is empty.
    ///
    /// This method is called when [`Pool::acquire_with`] is invoked but no objects
    /// are available in the pool's free list. The `config` parameter allows for
    /// parameterized object creation.
    ///
    /// # Examples
    ///
    /// Creating a vector with specific initial capacity:
    ///
    /// ```
    /// # use hashql_core::collections::pool::Recycler;
    /// # struct MyRecycler;
    /// # impl Recycler<Vec<i32>> for MyRecycler {
    /// #     type Config = usize;
    /// fn acquire(&mut self, capacity: usize) -> Vec<i32> {
    ///     Vec::with_capacity(capacity)
    /// }
    /// #     fn recycle(&mut self, item: &mut Vec<i32>) {}
    /// #     fn prepare(&mut self, _: &mut Vec<i32>, _: usize) {}
    /// # }
    /// ```
    fn acquire(&mut self, config: Self::Config) -> T;

    /// Prepares a recycled object for reuse with new configuration.
    ///
    /// This method is called after retrieving an object from the pool's free list
    /// but before returning it to the caller. It allows the recycler to adjust
    /// the object based on the new configuration parameters.
    ///
    /// # Examples
    ///
    /// Ensuring a vector has adequate capacity for new usage:
    ///
    /// ```
    /// # use hashql_core::collections::pool::Recycler;
    /// # struct MyRecycler;
    /// # impl Recycler<Vec<i32>> for MyRecycler {
    /// #     type Config = usize;
    /// fn prepare(&mut self, item: &mut Vec<i32>, capacity: usize) {
    ///     if item.capacity() < capacity {
    ///         item.reserve(capacity - item.capacity());
    ///     }
    /// }
    /// #     fn recycle(&mut self, item: &mut Vec<i32>) {}
    /// #     fn acquire(&mut self, capacity: usize) -> Vec<i32> { Vec::new() }
    /// # }
    /// ```
    fn prepare(&mut self, item: &mut T, config: Self::Config);
}

/// A generic object pool for efficient resource reuse.
///
/// `Pool<T, R>` manages a collection of reusable objects of type `T` using a recycler
/// of type `R` that implements [`Recycler<T>`]. The pool maintains an internal free
/// list of available objects and provides methods to acquire objects for use and
/// release them back to the pool.
///
/// The pool has a configurable capacity that limits the number of objects kept in
/// the free list. When objects are released to a full pool, they are simply dropped
/// rather than stored, preventing unbounded memory growth.
///
/// # Type Parameters
///
/// - `T` - The type of objects being pooled
/// - `R` - The recycler type that implements [`Recycler<T>`]
///
/// # Memory Management
///
/// Objects in the pool are stored in a [`Vec`] which may have capacity greater than
/// the pool's configured capacity for efficiency. The pool will only grow the
/// underlying vector when necessary and will truncate it when the capacity is reduced.
///
/// # Examples
///
/// Creating and using a basic pool:
///
/// ```
/// use hashql_core::collections::pool::{Pool, VecRecycler};
///
/// let mut pool = Pool::with_recycler(5, VecRecycler::default());
///
/// // Acquire objects
/// let mut vec1 = pool.acquire_with(100);
/// let mut vec2 = pool.acquire_with(200);
///
/// // Use the objects
/// vec1.push(42);
/// vec2.extend([1, 2, 3]);
///
/// // Return them to the pool
/// pool.release(vec1);
/// pool.release(vec2);
///
/// // Pool now contains 2 recycled vectors ready for reuse
/// ```
#[derive(Debug)]
pub struct Pool<T, R> {
    free: Vec<T>,
    recycler: R,
    capacity: usize,
}

impl<T, R> Pool<T, R> {
    /// Creates a new pool with the specified capacity and a default recycler.
    ///
    /// The `capacity` parameter sets the maximum number of objects that will be
    /// kept in the pool's free list.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::collections::pool::VecPool;
    ///
    /// let mut pool = VecPool::<i32>::new(10);
    /// assert_eq!(pool.capacity(), 10);
    /// ```
    #[must_use]
    pub fn new(capacity: usize) -> Self
    where
        R: Default,
    {
        Self::with_recycler(capacity, R::default())
    }

    /// Creates a new pool with the specified capacity and recycler instance.
    ///
    /// This constructor allows you to provide a custom recycler instance, which
    /// is useful when the recycler needs specific configuration or doesn't
    /// implement [`Default`].
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::collections::pool::{MixedBitSetPool, MixedBitSetRecycler};
    /// # hashql_core::id::newtype!(struct VarId(u32 is 0..=u32::MAX));
    ///
    /// let recycler = MixedBitSetRecycler { domain_size: 1000 };
    /// let mut pool = MixedBitSetPool::<VarId>::with_recycler(5, recycler);
    /// ```
    pub fn with_recycler(capacity: usize, recycler: R) -> Self {
        Self {
            free: Vec::with_capacity(capacity),
            recycler,
            capacity,
        }
    }
}

impl<T, R> Pool<T, R>
where
    R: Recycler<T>,
{
    /// Changes the pool's capacity, adjusting internal storage as needed.
    ///
    /// If the new capacity is smaller than the current number of free objects,
    /// excess objects will be dropped. If the new capacity is larger, the
    /// internal storage may be expanded to accommodate more objects.
    ///
    /// This operation may cause memory allocation or deallocation depending
    /// on the size change and current state of the pool.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::collections::pool::VecPool;
    ///
    /// let mut pool = VecPool::<i32>::new(10);
    ///
    /// // Fill the pool with some objects
    /// for _ in 0..5 {
    ///     let vec = pool.acquire_with(10);
    ///     pool.release(vec);
    /// }
    ///
    /// // Reduce capacity - excess objects will be dropped
    /// pool.resize(3);
    /// assert_eq!(pool.capacity(), 3);
    ///
    /// // Increase capacity - pool can now hold more objects
    /// pool.resize(20);
    /// assert_eq!(pool.capacity(), 20);
    /// ```
    pub fn resize(&mut self, new_max_size: usize) {
        self.capacity = new_max_size;
        if self.free.len() > new_max_size {
            self.free.truncate(new_max_size);
        }

        if self.free.len() < new_max_size {
            self.free.reserve(new_max_size - self.free.len());
        }
    }

    /// Returns the current capacity of the pool.
    ///
    /// The capacity represents the maximum number of objects that can be stored
    /// in the pool's free list. Objects released to a full pool will be dropped.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::collections::pool::VecPool;
    ///
    /// let pool = VecPool::<i32>::new(15);
    /// assert_eq!(pool.capacity(), 15);
    /// ```
    pub const fn capacity(&self) -> usize {
        self.capacity
    }

    /// Acquires an object from the pool with the specified configuration.
    ///
    /// If objects are available in the free list, one will be retrieved, prepared
    /// with the given configuration via [`Recycler::prepare`], and returned.
    /// If no objects are available, a new one will be created using
    /// [`Recycler::acquire`].
    ///
    /// This is the primary method for obtaining objects from the pool and allows
    /// for parameterized object creation or preparation.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::collections::pool::VecPool;
    ///
    /// let mut pool = VecPool::<i32>::new(5);
    ///
    /// // Acquire a vector with capacity 100
    /// let vec1 = pool.acquire_with(100);
    /// assert!(vec1.capacity() >= 100);
    ///
    /// // Return it and acquire another with different capacity
    /// pool.release(vec1);
    /// let vec2 = pool.acquire_with(50);
    /// // vec2 is the recycled vector, potentially with capacity >= 100
    /// ```
    pub fn acquire_with(&mut self, config: R::Config) -> T {
        let Some(mut item) = self.free.pop() else {
            return self.recycler.acquire(config);
        };

        self.recycler.prepare(&mut item, config);
        item
    }

    /// Acquires an object from the pool using the default configuration.
    ///
    /// This is a convenience method for recyclers that don't require configuration
    /// (i.e., their `Config` type is `()`). It's equivalent to calling
    /// `acquire_with(())`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     collections::pool::{MixedBitSetPool, MixedBitSetRecycler},
    ///     id::bit_vec::MixedBitSet,
    /// };
    /// # hashql_core::id::newtype!(struct VarId(u32 is 0..=u32::MAX));
    ///
    /// let recycler = MixedBitSetRecycler { domain_size: 100 };
    /// let mut pool = MixedBitSetPool::<VarId>::with_recycler(5, recycler);
    ///
    /// let bitset = pool.acquire(); // No config needed
    /// // Use bitset...
    /// pool.release(bitset);
    /// ```
    pub fn acquire(&mut self) -> T
    where
        R: Recycler<T, Config = ()>,
    {
        self.acquire_with(())
    }

    /// Returns an object to the pool for future reuse.
    ///
    /// The object will be recycled via [`Recycler::recycle`] and added to the
    /// free list if there's space. If the pool is at capacity, the object
    /// will be dropped instead of stored.
    ///
    /// This method enables the resource reuse that makes object pooling effective.
    /// Objects should be released as soon as they're no longer needed to maximize
    /// pool efficiency.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::collections::pool::VecPool;
    ///
    /// let mut pool = VecPool::<i32>::new(3);
    ///
    /// // Acquire and use objects
    /// let mut vec1 = pool.acquire_with(10);
    /// vec1.push(42);
    ///
    /// let mut vec2 = pool.acquire_with(20);
    /// vec2.extend([1, 2, 3]);
    ///
    /// // Release them back to the pool
    /// pool.release(vec1); // Now available for reuse (cleared)
    /// pool.release(vec2); // Also available for reuse (cleared)
    ///
    /// // Next acquisitions will reuse these objects
    /// let vec3 = pool.acquire_with(5);
    /// assert_eq!(vec3.len(), 0); // Recycled vector is cleared
    /// ```
    pub fn release(&mut self, mut item: T) {
        if self.free.len() >= self.capacity {
            return;
        }

        self.recycler.recycle(&mut item);
        self.free.push(item);
    }
}

/// Recycler implementation for [`Vec<T>`] that manages vector capacity efficiently.
///
/// `VecRecycler` handles the lifecycle of vectors in a pool by:
/// - Clearing contents during recycling while preserving capacity
/// - Creating new vectors with specified initial capacity
/// - Ensuring recycled vectors have adequate capacity for new usage
///
/// The recycler's configuration type is `usize`, representing the desired capacity
/// for vector operations. This allows callers to specify capacity requirements
/// when acquiring vectors from the pool.
///
/// # Memory Efficiency
///
/// This recycler is designed to minimize allocations by preserving vector capacity
/// across reuse cycles. Vectors are only grown when necessary and never shrunk,
/// following the principle that capacity represents already-allocated memory that
/// should be preserved.
///
/// # Examples
///
/// ```
/// use hashql_core::collections::pool::{Recycler, VecRecycler};
///
/// let mut recycler = VecRecycler::default();
///
/// // Create a new vector with capacity 50
/// let vec = recycler.acquire(50);
/// assert!(vec.capacity() >= 50);
///
/// // Use and modify the vector
/// let mut vec = vec;
/// vec.extend([1, 2, 3, 4, 5]);
/// assert_eq!(vec.len(), 5);
///
/// // Recycle it (clears content but preserves capacity)
/// recycler.recycle(&mut vec);
/// assert_eq!(vec.len(), 0);
/// assert!(vec.capacity() >= 50); // Capacity preserved
///
/// // Prepare for reuse with larger capacity requirement
/// recycler.prepare(&mut vec, 100);
/// assert!(vec.capacity() >= 100); // Capacity increased if needed
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub struct VecRecycler;

impl<T> Recycler<Vec<T>> for VecRecycler {
    /// Vector capacity specification for acquisition and preparation.
    type Config = usize;

    /// Clears the vector's contents while preserving its allocated capacity.
    ///
    /// This operation is O(n) in the number of elements but does not perform
    /// any memory deallocation, making it efficient for reuse scenarios.
    fn recycle(&mut self, item: &mut Vec<T>) {
        item.clear();
    }

    /// Creates a new vector with the specified initial capacity.
    ///
    /// The resulting vector will have at least the requested capacity,
    /// though the actual capacity may be larger due to allocator behavior.
    fn acquire(&mut self, config: Self::Config) -> Vec<T> {
        Vec::with_capacity(config)
    }

    /// Ensures the vector has adequate capacity for new usage patterns.
    ///
    /// If the vector's current capacity is less than the requested capacity,
    /// additional space will be reserved. The vector's capacity will never
    /// be reduced by this operation.
    ///
    /// # Performance
    ///
    /// This method only performs allocation when the current capacity is
    /// insufficient, making it efficient for scenarios where recycled
    /// objects often have adequate capacity.
    fn prepare(&mut self, item: &mut Vec<T>, config: Self::Config) {
        // Only *grow* the vector if it's smaller than the requested capacity
        if item.len() < config {
            item.reserve(config - item.len());
        }
    }
}

/// Type alias for a pool of vectors using [`VecRecycler`].
///
/// This is a convenience type for the common case of pooling vectors. The pool
/// will efficiently manage vector reuse while handling capacity requirements
/// through the recycler's configuration system.
///
/// # Examples
///
/// ```
/// use hashql_core::collections::pool::VecPool;
///
/// let mut pool = VecPool::<String>::new(10);
///
/// // Acquire vectors with different capacity requirements
/// let mut small_vec = pool.acquire_with(5);
/// let mut large_vec = pool.acquire_with(1000);
///
/// // Use the vectors
/// small_vec.push("hello".to_string());
/// large_vec.extend((0..100).map(|i| i.to_string()));
///
/// // Return to pool for reuse
/// pool.release(small_vec);
/// pool.release(large_vec);
/// ```
pub type VecPool<T> = Pool<Vec<T>, VecRecycler>;

/// Recycler implementation for [`MixedBitSet<I>`] with fixed domain size.
///
/// `MixedBitSetRecycler` manages the lifecycle of mixed bit sets in a pool.
/// Since bit sets have a fixed domain size that's set at creation time,
/// this recycler maintains a constant `domain_size` field that's used
/// for all bit set creation.
///
/// The recycler's configuration type is `()` since bit sets don't need
/// runtime configuration beyond their domain size, which is fixed at
/// recycler creation time.
///
/// # Domain Size Invariant
///
/// All bit sets created or managed by this recycler will have the same
/// domain size, which is set when the recycler is created. This ensures
/// consistency across all pooled bit sets and prevents domain size
/// mismatches during reuse.
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     collections::pool::{MixedBitSetPool, MixedBitSetRecycler, Pool},
///     id::bit_vec::MixedBitSet,
/// };
/// # hashql_core::id::newtype!(struct VarId(u32 is 0..=u32::MAX));
///
/// // Create recycler for bit sets with domain size 1000
/// let recycler = MixedBitSetRecycler { domain_size: 1000 };
/// let mut pool: MixedBitSetPool<VarId> = Pool::with_recycler(5, recycler);
///
/// // All acquired bit sets will have domain size 1000
/// let bitset1 = pool.acquire();
/// let bitset2 = pool.acquire();
///
/// // Use the bit sets...
/// pool.release(bitset1);
/// pool.release(bitset2);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Default)]
pub struct MixedBitSetRecycler {
    /// The fixed domain size for all bit sets managed by this recycler.
    pub domain_size: usize,
}

impl<I> Recycler<MixedBitSet<I>> for MixedBitSetRecycler
where
    I: Id,
{
    /// No configuration needed since domain size is fixed at recycler creation.
    type Config = ();

    /// Clears all bits in the set while preserving its allocated storage.
    ///
    /// This operation resets the bit set to an empty state without changing
    /// its domain size or deallocating any internal storage structures.
    ///
    /// # Panics
    ///
    /// Panics if the domain size of the bit set does not match the recycler's domain size.
    fn recycle(&mut self, item: &mut MixedBitSet<I>) {
        assert_eq!(item.domain_size(), self.domain_size);

        item.clear();
    }

    /// Creates a new empty bit set with the recycler's fixed domain size.
    ///
    /// The resulting bit set will be empty but capable of representing
    /// any subset of the domain defined by `self.domain_size`.
    fn acquire(&mut self, (): ()) -> MixedBitSet<I> {
        MixedBitSet::new_empty(self.domain_size)
    }

    /// No preparation needed since bit sets have fixed domain size.
    ///
    /// This method is a no-op because bit sets created by this recycler
    /// always have the correct domain size and don't require runtime
    /// configuration adjustments.
    fn prepare(&mut self, _: &mut MixedBitSet<I>, (): ()) {}
}

/// Type alias for a pool of mixed bit sets using [`MixedBitSetRecycler`].
///
/// This is a convenience type for pooling bit sets with a specific domain
/// size. All bit sets in the pool will share the same domain size, which
/// is configured when creating the recycler.
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     collections::pool::{MixedBitSetPool, MixedBitSetRecycler, Pool},
///     id::bit_vec::MixedBitSet,
/// };
/// # hashql_core::id::newtype!(struct VarId(u32 is 0..=u32::MAX));
///
/// // Create pool for bit sets with domain size 500
/// let recycler = MixedBitSetRecycler { domain_size: 500 };
/// let mut pool: MixedBitSetPool<VarId> = Pool::with_recycler(10, recycler);
///
/// // Acquire and use bit sets
/// let mut bitset = pool.acquire();
/// // Insert some elements...
///
/// // Return to pool for reuse
/// pool.release(bitset);
/// ```
pub type MixedBitSetPool<I> = Pool<MixedBitSet<I>, MixedBitSetRecycler>;
