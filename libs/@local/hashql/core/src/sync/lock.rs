//! Unified lock abstraction for thread-local and thread-safe synchronization.
//!
//! This module provides [`Lock<T, L>`], a type-level abstraction that can be either thread-local
//! ([`LocalLock<T>`]) or thread-safe ([`SharedLock<T>`]) depending on the type parameter `L`.
//!
//! # Design
//!
//! The abstraction uses the type system to ensure correct usage:
//! - [`Lock<T, Local>`] wraps [`RefCell<T>`] for single-threaded scenarios
//! - [`Lock<T, Shared>`] wraps [`Mutex<T>`] for multi-threaded scenarios
//!
//! This allows code to be written generically over the lock type, enabling easy migration
//! between single-threaded and multi-threaded implementations without changing call sites.
//!
//! # Type Safety
//!
//! The [`LockType`] trait uses never types (`!`) and marker types to make invalid states
//! unrepresentable.
//!
//! # Examples
//!
//! Thread-local lock (using [`RefCell`]):
//!
//! ```
//! use hashql_core::sync::lock::LocalLock;
//!
//! let lock = LocalLock::new(vec![1, 2, 3]);
//!
//! // Access with map (automatic lock/unlock)
//! let sum = lock.map(|data| data.iter().sum::<i32>());
//! assert_eq!(sum, 6);
//!
//! // Or hold a guard
//! let mut guard = lock.lock();
//! guard.push(4);
//! ```
//!
//! Thread-safe lock (using [`Mutex`]):
//!
//! ```
//! use std::{sync::Arc, thread};
//!
//! use hashql_core::sync::lock::SharedLock;
//!
//! let lock = Arc::new(SharedLock::new(0));
//!
//! let handles: Vec<_> = (0..10)
//!     .map(|_| {
//!         let lock = Arc::clone(&lock);
//!         thread::spawn(move || {
//!             lock.map(|counter| *counter += 1);
//!         })
//!     })
//!     .collect();
//!
//! for handle in handles {
//!     handle.join().unwrap();
//! }
//!
//! assert_eq!(*lock.lock(), 10);
//! ```

use core::{
    cell::{RefCell, RefMut},
    fmt,
    marker::PhantomData,
    ops::{Deref, DerefMut},
};
use std::sync::{Mutex, MutexGuard};

use self::sealed::Sealed;

mod sealed {
    use super::{Local, Shared};

    pub trait Sealed {}

    impl Sealed for Local {}
    impl Sealed for Shared {}
}

/// Trait for types that can parameterize [`Lock`] to be either thread-local or thread-safe.
///
/// This trait is sealed and cannot be implemented outside this module. The only implementations
/// are [`Local`] and [`Shared`].
///
/// # Design
///
/// Uses associated types with never types (`!`) to make invalid lock type combinations
/// unrepresentable at compile time. This ensures type safety without runtime overhead.
pub trait LockType: Sealed {
    /// Marker type used for [`Local`] locks.
    ///
    /// For [`Local`], this is `()`. For [`Shared`], this is the never type `!`.
    type LocalMarker: fmt::Debug;

    /// Marker type used for [`Shared`] locks.
    ///
    /// For [`Shared`], this is `()`. For [`Local`], this is the never type `!`.
    type SharedMarker: fmt::Debug;
}

/// Marker type for thread-local locks.
///
/// When used with [`Lock`], creates a [`LocalLock<T>`] that is not thread-safe
/// but has lower overhead than [`Mutex`]-based locks.
///
/// # Examples
///
/// ```
/// use hashql_core::sync::lock::{Local, LocalLock, Lock};
///
/// let lock: Lock<Vec<i32>, Local> = LocalLock::new(vec![]);
/// ```
#[derive(Debug)]
pub struct Local;

impl LockType for Local {
    type LocalMarker = ();
    type SharedMarker = !;
}

/// Marker type for thread-safe locks.
///
/// When used with [`Lock`], creates a [`SharedLock<T>`] that can be safely
/// shared across threads.
///
/// # Examples
///
/// ```
/// use std::sync::Arc;
///
/// use hashql_core::sync::lock::{Lock, Shared, SharedLock};
///
/// let lock: Arc<Lock<Vec<i32>, Shared>> = Arc::new(SharedLock::new(vec![]));
/// ```
#[derive(Debug)]
pub struct Shared;

impl LockType for Shared {
    type LocalMarker = !;
    type SharedMarker = ();
}

/// Internal enum wrapping either [`RefMut`] or [`MutexGuard`].
///
/// This is only ever constructed from a correct [`LockInner`], therefore we use [`PhantomData`]
/// to encode the lock type at the type level.
enum LockGuardInner<'lock, T, L: LockType> {
    Local(RefMut<'lock, T>, PhantomData<L::LocalMarker>),
    Shared(MutexGuard<'lock, T>, PhantomData<L::SharedMarker>),
}

/// RAII guard for a locked value.
///
/// When this guard is dropped, the lock is released. The guard dereferences to the inner `T`,
/// allowing both immutable and mutable access to the locked data.
///
/// # Panics
///
/// Operations on this guard will panic if the underlying lock has been poisoned (for [`Mutex`])
/// or if borrow rules are violated (for [`RefCell`]).
///
/// # Examples
///
/// ```
/// use hashql_core::sync::lock::LocalLock;
///
/// let lock = LocalLock::new(vec![1, 2, 3]);
///
/// {
///     let mut guard = lock.lock();
///     guard.push(4);
/// } // Lock released here
///
/// assert_eq!(lock.lock().len(), 4);
/// ```
pub struct LockGuard<'lock, T, L: LockType> {
    inner: LockGuardInner<'lock, T, L>,
}

impl<T, L: LockType> Deref for LockGuard<'_, T, L> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        match &self.inner {
            LockGuardInner::Local(inner, _) => inner,
            LockGuardInner::Shared(inner, _) => inner,
        }
    }
}

impl<T, L: LockType> DerefMut for LockGuard<'_, T, L> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        match &mut self.inner {
            LockGuardInner::Local(inner, _) => inner,
            LockGuardInner::Shared(inner, _) => inner,
        }
    }
}

#[expect(clippy::empty_drop, reason = "do not allow destructure")]
impl<T, L: LockType> Drop for LockGuard<'_, T, L> {
    fn drop(&mut self) {}
}

#[derive(Debug)]
enum LockInner<T, L: LockType> {
    Shared(Mutex<T>, L::SharedMarker),
    Local(RefCell<T>, L::LocalMarker),
}

// SAFETY: The same safety invariants apply as the ones from `RefCell`
#[expect(unsafe_code)]
unsafe impl<T: Send> Send for LockInner<T, Local> {}

// SAFETY: The same safety invariants apply as the ones from `Mutex`
#[expect(unsafe_code)]
unsafe impl<T: Send> Send for LockInner<T, Shared> {}

// SAFETY: The same safety invariants apply as the ones from `Mutex`
#[expect(unsafe_code)]
unsafe impl<T: Send> Sync for LockInner<T, Shared> {}

/// A lock that can be either thread-local ([`Local`]) or thread-safe ([`Shared`]).
///
/// This type provides a unified interface for synchronization that can be selected at the
/// type level.
///
/// # Type Parameters
///
/// - `T` - The type of the value being protected
/// - `L` - The lock type, either [`Local`] or [`Shared`]
///
/// # Thread Safety
///
/// - [`Lock<T, Local>`] (aka [`LocalLock<T>`]) is **not** thread-safe
/// - [`Lock<T, Shared>`] (aka [`SharedLock<T>`]) is thread-safe when `T: Send`
///
/// # Examples
///
/// Using as a thread-local lock:
///
/// ```
/// use hashql_core::sync::lock::LocalLock;
///
/// let lock = LocalLock::new(42);
///
/// // Automatic lock/unlock with map
/// let doubled = lock.map(|value| *value * 2);
/// assert_eq!(doubled, 84);
///
/// // Manual lock with guard
/// let mut guard = lock.lock();
/// *guard += 10;
/// drop(guard);
///
/// assert_eq!(*lock.lock(), 52);
/// ```
///
/// Using as a thread-safe lock:
///
/// ```
/// use std::{sync::Arc, thread};
///
/// use hashql_core::sync::lock::SharedLock;
///
/// let lock = Arc::new(SharedLock::new(vec![]));
///
/// let handles: Vec<_> = (0..5)
///     .map(|i| {
///         let lock = Arc::clone(&lock);
///         thread::spawn(move || {
///             lock.map(|data| data.push(i));
///         })
///     })
///     .collect();
///
/// for handle in handles {
///     handle.join().unwrap();
/// }
///
/// assert_eq!(lock.lock().len(), 5);
/// ```
#[derive(Debug)]
pub struct Lock<T, L: LockType> {
    inner: LockInner<T, L>,
}

impl<T> Lock<T, Local> {
    /// Creates a new thread-local lock.
    ///
    /// This uses [`RefCell`] internally and is not thread-safe.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::sync::lock::{Local, Lock};
    ///
    /// let lock = Lock::<_, Local>::new(42);
    /// ```
    pub const fn new(value: T) -> Self {
        Self {
            inner: LockInner::Local(RefCell::new(value), ()),
        }
    }
}

impl<T> Lock<T, Shared> {
    /// Creates a new thread-safe lock.
    ///
    /// This uses [`Mutex`] internally and can be safely shared across threads
    /// when `T: Send`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::sync::lock::{Lock, Shared};
    ///
    /// let lock = Lock::<_, Shared>::new(42);
    /// ```
    pub const fn new(value: T) -> Self {
        Self {
            inner: LockInner::Shared(Mutex::new(value), ()),
        }
    }
}

impl<T, L: LockType> Lock<T, L> {
    /// Locks the value and applies a closure to it, returning the closure's result.
    ///
    /// This method automatically acquires and releases the lock, ensuring the lock
    /// is held for the minimum duration. The closure receives a mutable reference
    /// to the locked data.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - The lock is poisoned (for [`Mutex`]-based locks)
    /// - The value is already borrowed (for [`RefCell`]-based locks)
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::sync::lock::LocalLock;
    ///
    /// let lock = LocalLock::new(vec![1, 2, 3]);
    ///
    /// // Compute sum without holding the lock longer than necessary
    /// let sum = lock.map(|data| data.iter().sum::<i32>());
    /// assert_eq!(sum, 6);
    ///
    /// // Modify the data
    /// lock.map(|data| data.push(4));
    /// assert_eq!(lock.map(|data| data.len()), 4);
    /// ```
    pub fn map<U>(&self, closure: impl FnOnce(&mut T) -> U) -> U {
        match &self.inner {
            LockInner::Local(cell, _) => {
                let mut data = cell.borrow_mut();

                closure(&mut *data)
            }
            LockInner::Shared(mutex, _) => {
                let mut data = mutex.lock().expect("lock shouldn't have been poisoned");

                closure(&mut *data)
            }
        }
    }

    /// Acquires the lock and returns a guard that dereferences to the locked data.
    ///
    /// The lock is held until the guard is dropped. Use this when you need to perform
    /// multiple operations on the locked data or when you need to return a reference
    /// that outlives a single operation.
    ///
    /// For single operations, prefer [`map`](Self::map) which automatically releases
    /// the lock.
    ///
    /// # Panics
    ///
    /// Panics if:
    /// - The lock is poisoned (for [`Mutex`]-based locks)
    /// - The value is already borrowed (for [`RefCell`]-based locks)
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::sync::lock::LocalLock;
    ///
    /// let lock = LocalLock::new(vec![1, 2, 3]);
    ///
    /// {
    ///     let mut guard = lock.lock();
    ///     guard.push(4);
    ///     guard.push(5);
    ///     // Multiple operations on the same guard
    /// } // Lock released here
    ///
    /// assert_eq!(lock.lock().len(), 5);
    /// ```
    pub fn lock(&self) -> LockGuard<'_, T, L> {
        match &self.inner {
            LockInner::Local(cell, _) => {
                let data = cell.borrow_mut();

                LockGuard {
                    inner: LockGuardInner::Local(data, PhantomData),
                }
            }
            LockInner::Shared(mutex, _) => {
                let data = mutex.lock().expect("lock shouldn't have been poisoned");

                LockGuard {
                    inner: LockGuardInner::Shared(data, PhantomData),
                }
            }
        }
    }

    /// Returns a mutable reference to the underlying data.
    ///
    /// Since this method takes `&mut self`, no locking is required - the borrow checker
    /// ensures exclusive access. This is the most efficient way to access the data when
    /// you have exclusive ownership of the lock.
    ///
    /// # Panics
    ///
    /// For [`Mutex`]-based locks, panics if the mutex has been poisoned.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::sync::lock::LocalLock;
    ///
    /// let mut lock = LocalLock::new(vec![1, 2, 3]);
    ///
    /// // Direct mutable access without locking
    /// lock.get_mut().push(4);
    ///
    /// assert_eq!(lock.lock().len(), 4);
    /// ```
    pub fn get_mut(&mut self) -> &mut T {
        match &mut self.inner {
            LockInner::Local(cell, _) => cell.get_mut(),
            LockInner::Shared(mutex, _) => {
                mutex.get_mut().expect("lock shouldn't have been poisoned")
            }
        }
    }
}

impl<T> Default for Lock<T, Local>
where
    T: Default,
{
    fn default() -> Self {
        Self::new(Default::default())
    }
}

impl<T> Default for Lock<T, Shared>
where
    T: Default,
{
    fn default() -> Self {
        Self::new(Default::default())
    }
}

impl<T> From<T> for Lock<T, Local> {
    fn from(value: T) -> Self {
        Self::new(value)
    }
}

impl<T> From<T> for Lock<T, Shared> {
    fn from(value: T) -> Self {
        Self::new(value)
    }
}

/// Type alias for thread-local locks using [`RefCell`].
///
/// This is equivalent to [`Lock<T, Local>`] and provides a more convenient name
/// for the common case of thread-local synchronization.
///
/// # Thread Safety
///
/// **Not thread-safe.** Cannot be sent across threads or shared between threads.
///
/// # Examples
///
/// ```
/// use hashql_core::sync::lock::LocalLock;
///
/// let lock = LocalLock::new(42);
/// lock.map(|value| *value += 1);
/// assert_eq!(*lock.lock(), 43);
/// ```
pub type LocalLock<T> = Lock<T, Local>;

/// Type alias for thread-safe locks using [`Mutex`].
///
/// This is equivalent to [`Lock<T, Shared>`] and provides a more convenient name
/// for the common case of thread-safe synchronization.
///
/// # Thread Safety
///
/// **Thread-safe** when `T: Send`. Can be safely shared across threads using [`Arc`].
///
/// [`Arc`]: std::sync::Arc
///
/// # Examples
///
/// ```
/// use std::{sync::Arc, thread};
///
/// use hashql_core::sync::lock::SharedLock;
///
/// let lock = Arc::new(SharedLock::new(0));
/// let lock_clone = Arc::clone(&lock);
///
/// let handle = thread::spawn(move || {
///     lock_clone.map(|value| *value += 1);
/// });
///
/// handle.join().unwrap();
/// assert_eq!(*lock.lock(), 1);
/// ```
pub type SharedLock<T> = Lock<T, Shared>;
