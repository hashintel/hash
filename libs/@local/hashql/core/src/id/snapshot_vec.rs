//! Snapshot-capable vector with typed ID indexing.
//!
//! Provides [`IdSnapshotVec`], which combines the typed indexing of [`IdVec`] with transactional
//! snapshot/rollback support. Mutations are tracked automatically when a snapshot is active and
//! can be undone by rolling back to a previous [`Snapshot`].
//!
//! # Examples
//!
//! ```
//! use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
//!
//! newtype!(struct NodeId(u32 is 0..=1000));
//!
//! let mut vec = IdSnapshotVec::<NodeId, &str>::new();
//! let first = vec.push("hello");
//! let second = vec.push("world");
//!
//! let snapshot = vec.snapshot();
//! vec.push("extra");
//! vec.set(first, "replaced");
//! assert_eq!(vec.len(), 3);
//! assert_eq!(vec[first], "replaced");
//!
//! vec.rollback_to(snapshot);
//! assert_eq!(vec.len(), 2);
//! assert_eq!(vec[first], "hello");
//! assert_eq!(vec[second], "world");
//! ```
//!
//! [`IdVec`]: super::IdVec

use alloc::{alloc::Global, vec};
use core::{
    alloc::Allocator,
    borrow::Borrow,
    fmt::{self, Debug},
    hash::{Hash, Hasher},
    mem,
    ops::Deref,
};

use super::{Id, IdVec, slice::IdSlice};

/// Defines how custom mutations are undone during rollback.
///
/// Built-in implementations:
/// - [`AppendOnly`]: no custom deltas, only push/pop/set tracking.
///
/// Implement this trait to support custom undo actions recorded via
/// [`IdSnapshotVec::record`].
pub trait UndoStrategy<I, T> {
    /// The undo record stored when [`IdSnapshotVec::record`] is called.
    type Delta<A: Allocator>;

    /// Applies a [`Delta`](Self::Delta) to the backing storage, restoring previous state.
    fn reverse<A: Allocator>(values: &mut IdVec<I, T, A>, delta: Self::Delta<A>);
}

/// No custom undo actions. Only push/pop/set operations are tracked.
///
/// This is the default [`UndoStrategy`] for [`IdSnapshotVec`].
pub struct AppendOnly;

impl<I, T> UndoStrategy<I, T> for AppendOnly {
    type Delta<A: Allocator> = ();

    fn reverse<A: Allocator>(_: &mut IdVec<I, T, A>, (): ()) {}
}

enum LogEntry<I, T, S: UndoStrategy<I, T>, A: Allocator = Global> {
    Push,
    Pop(T),
    Set(I, T),
    Clear(IdVec<I, T, A>),
    Delta(S::Delta<A>),
}

struct Log<I, T, S: UndoStrategy<I, T>, A: Allocator = Global> {
    tape: Vec<LogEntry<I, T, S, A>, A>,
    open: usize,
}

impl<I, T, S: UndoStrategy<I, T>> Log<I, T, S> {
    const fn new() -> Self {
        Self {
            tape: Vec::new(),
            open: 0,
        }
    }
}

impl<I, T, S: UndoStrategy<I, T>, A: Allocator> Log<I, T, S, A> {
    const fn new_in(alloc: A) -> Self {
        Self {
            tape: Vec::new_in(alloc),
            open: 0,
        }
    }

    const fn recording(&self) -> bool {
        self.open > 0
    }

    const fn start(&mut self) -> Snapshot {
        self.open += 1;
        Snapshot {
            tape_len: self.tape.len(),
        }
    }

    #[expect(clippy::needless_pass_by_value)]
    fn rollback(&mut self, snapshot: Snapshot, container: &mut IdVec<I, T, A>)
    where
        I: Id,
    {
        self.assert(&snapshot);
        self.open -= 1;

        while self.tape.len() > snapshot.tape_len {
            let entry = self.tape.pop().expect("tape length verified by loop guard");

            match entry {
                LogEntry::Push => {
                    container
                        .pop()
                        .expect("Push log entry implies non-empty vec");
                }
                LogEntry::Pop(value) => {
                    container.push(value);
                }
                LogEntry::Clear(previous) => {
                    *container = previous;
                }
                LogEntry::Set(index, old_value) => {
                    container[index] = old_value;
                }
                LogEntry::Delta(delta) => {
                    S::reverse(container, delta);
                }
            }
        }
    }

    #[expect(clippy::needless_pass_by_value)]
    fn commit(&mut self, snapshot: Snapshot) {
        self.assert(&snapshot);
        self.open -= 1;

        if self.open == 0 {
            self.tape.clear();
        }
    }

    fn assert(&self, snapshot: &Snapshot) {
        assert!(
            self.tape.len() >= snapshot.tape_len,
            "snapshot tape_len exceeds current tape length"
        );
        assert!(self.open > 0, "no open snapshot to commit or rollback");
    }
}

/// Opaque snapshot token for [`IdSnapshotVec`].
///
/// Must be consumed by [`IdSnapshotVec::rollback_to`] or [`IdSnapshotVec::commit`] in stack
/// (LIFO) order. Dropping a `Snapshot` without consuming it will not undo changes, but
/// subsequent snapshot operations may panic.
pub struct Snapshot {
    tape_len: usize,
}

/// A snapshot-capable vector that uses typed IDs for indexing.
///
/// Combines the typed indexing of [`IdVec`] with transactional snapshot/rollback support.
/// Mutations via [`push`], [`pop`], and [`set`] are tracked automatically when a snapshot is
/// active. On rollback, all changes since the snapshot are undone in reverse order.
///
/// Custom undo actions can be recorded via [`record`] when using a non-default [`UndoStrategy`].
///
/// The API is not complete by design, new methods will be added as needed.
///
/// [`push`]: IdSnapshotVec::push
/// [`pop`]: IdSnapshotVec::pop
/// [`set`]: IdSnapshotVec::set
/// [`record`]: IdSnapshotVec::record
pub struct IdSnapshotVec<I, T, S: UndoStrategy<I, T> = AppendOnly, A: Allocator = Global> {
    inner: IdVec<I, T, A>,
    log: Log<I, T, S, A>,
}

#[coverage(off)]
impl<I, T> IdSnapshotVec<I, T, AppendOnly>
where
    I: Id,
{
    /// No allocation is performed until elements are pushed.
    #[inline]
    #[must_use]
    pub const fn new() -> Self {
        Self {
            inner: IdVec::new(),
            log: Log::new(),
        }
    }

    /// Pre-allocates storage for at least `capacity` elements. The undo log is not
    /// pre-allocated.
    #[inline]
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            inner: IdVec::with_capacity(capacity),
            log: Log::new(),
        }
    }
}

#[coverage(off)]
impl<I, T, A: Allocator> IdSnapshotVec<I, T, AppendOnly, A>
where
    I: Id,
{
    /// Wraps an existing [`IdVec`] with snapshot/rollback support.
    ///
    /// The elements already in `inner` are retained. No snapshot is active initially.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, IdVec, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut plain = IdVec::<NodeId, i32>::new();
    /// plain.push(10);
    /// plain.push(20);
    ///
    /// let mut vec = IdSnapshotVec::from_vec(plain);
    /// assert_eq!(vec.len(), 2);
    ///
    /// let snap = vec.snapshot();
    /// vec.push(30);
    /// vec.rollback_to(snap);
    /// assert_eq!(vec.len(), 2);
    /// ```
    #[inline]
    pub fn from_vec(inner: IdVec<I, T, A>) -> Self
    where
        A: Clone,
    {
        Self {
            log: Log::new_in(inner.allocator().clone()),
            inner,
        }
    }
}

#[coverage(off)]
impl<I, T, S: UndoStrategy<I, T>, A: Allocator> IdSnapshotVec<I, T, S, A>
where
    I: Id,
{
    /// Both the backing storage and the undo log are allocated in `alloc`.
    #[inline]
    pub fn new_in(alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            inner: IdVec::new_in(alloc.clone()),
            log: Log::new_in(alloc),
        }
    }

    /// Appends `value` and returns the assigned ID. Tracked for rollback when a snapshot is
    /// active.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut vec = IdSnapshotVec::<NodeId, &str>::new();
    /// let first = vec.push("kept");
    ///
    /// let snap = vec.snapshot();
    /// vec.push("temporary");
    /// assert_eq!(vec.len(), 2);
    ///
    /// vec.rollback_to(snap);
    /// assert_eq!(vec.len(), 1);
    /// assert_eq!(vec[first], "kept");
    /// ```
    #[inline]
    pub fn push(&mut self, value: T) -> I {
        if self.log.recording() {
            self.log.tape.push(LogEntry::Push);
        }

        self.inner.push(value)
    }

    /// Removes and returns the last element. Tracked for rollback when a snapshot is active.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut vec = IdSnapshotVec::<NodeId, i32>::new();
    /// vec.push(10);
    /// vec.push(20);
    ///
    /// let snap = vec.snapshot();
    /// assert_eq!(vec.pop(), Some(20));
    /// assert_eq!(vec.len(), 1);
    ///
    /// vec.rollback_to(snap);
    /// assert_eq!(vec.len(), 2);
    /// assert_eq!(vec[NodeId::new(1)], 20);
    /// ```
    #[inline]
    pub fn pop(&mut self) -> Option<T>
    where
        T: Clone,
    {
        let value = self.inner.pop()?;

        if self.log.recording() {
            self.log.tape.push(LogEntry::Pop(value.clone()));
        }

        Some(value)
    }

    /// Replaces the element at `index` and returns the old value. Tracked for rollback when a
    /// snapshot is active.
    ///
    /// # Panics
    ///
    /// Panics if `index` is out of bounds.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut vec = IdSnapshotVec::<NodeId, &str>::new();
    /// let id = vec.push("original");
    ///
    /// let snap = vec.snapshot();
    /// let old = vec.set(id, "replaced");
    /// assert_eq!(old, "original");
    /// assert_eq!(vec[id], "replaced");
    ///
    /// vec.rollback_to(snap);
    /// assert_eq!(vec[id], "original");
    /// ```
    #[inline]
    pub fn set(&mut self, index: I, value: T) -> T
    where
        T: Clone,
    {
        let previous = mem::replace(&mut self.inner[index], value);

        if self.log.recording() {
            self.log.tape.push(LogEntry::Set(index, previous.clone()));
        }

        previous
    }

    /// Applies `op` to the element at `index` in-place. Tracked for rollback when a snapshot
    /// is active.
    ///
    /// # Panics
    ///
    /// Panics if `index` is out of bounds.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut vec = IdSnapshotVec::<NodeId, String>::new();
    /// let id = vec.push("hello".to_string());
    ///
    /// let snap = vec.snapshot();
    /// vec.update(id, |value| value.push_str(" world"));
    /// assert_eq!(vec[id], "hello world");
    ///
    /// vec.rollback_to(snap);
    /// assert_eq!(vec[id], "hello");
    /// ```
    #[inline]
    pub fn update(&mut self, index: I, op: impl FnOnce(&mut T))
    where
        T: Clone,
    {
        if self.log.recording() {
            self.log
                .tape
                .push(LogEntry::Set(index, self.inner[index].clone()));
        }

        op(&mut self.inner[index]);
    }

    /// Records a custom undo delta.
    ///
    /// When the current snapshot is rolled back, [`UndoStrategy::reverse`] will be called with
    /// this delta. Has no effect if no snapshot is active.
    #[inline]
    pub fn record(&mut self, delta: S::Delta<A>) {
        if self.log.recording() {
            self.log.tape.push(LogEntry::Delta(delta));
        }
    }

    /// Reserves capacity for at least `additional` more elements in the backing storage.
    #[inline]
    pub fn reserve(&mut self, additional: usize) {
        self.inner.reserve(additional);
    }

    /// Removes all elements. Tracked for rollback when a snapshot is active.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut vec = IdSnapshotVec::<NodeId, i32>::new();
    /// vec.push(1);
    /// vec.push(2);
    /// vec.push(3);
    ///
    /// let snap = vec.snapshot();
    /// vec.clear();
    /// assert!(vec.is_empty());
    ///
    /// vec.rollback_to(snap);
    /// assert_eq!(vec.len(), 3);
    /// assert_eq!(vec[NodeId::new(2)], 3);
    /// ```
    pub fn clear(&mut self)
    where
        A: Clone,
    {
        if !self.log.recording() {
            self.inner.clear();
            return;
        }

        let replacement =
            IdVec::with_capacity_in(self.inner.raw.capacity(), self.inner.allocator().clone());
        let previous = mem::replace(&mut self.inner, replacement);

        self.log.tape.push(LogEntry::Clear(previous));
    }

    /// Begins a new snapshot.
    ///
    /// All mutations after this call can be undone by passing the returned [`Snapshot`] to
    /// [`rollback_to`], or kept by passing it to [`commit`]. Snapshots may be nested but must
    /// be consumed in stack (LIFO) order.
    ///
    /// [`rollback_to`]: IdSnapshotVec::rollback_to
    /// [`commit`]: IdSnapshotVec::commit
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut vec = IdSnapshotVec::<NodeId, i32>::new();
    /// vec.push(1);
    ///
    /// let snap = vec.snapshot();
    /// vec.push(2);
    /// vec.push(3);
    /// assert_eq!(vec.len(), 3);
    ///
    /// vec.rollback_to(snap);
    /// assert_eq!(vec.len(), 1);
    /// ```
    #[inline]
    pub const fn snapshot(&mut self) -> Snapshot {
        self.log.start()
    }

    /// Undoes all changes made since `snapshot` was created.
    ///
    /// Changes are undone in reverse order: pushes are popped, pops are re-pushed, and sets
    /// restore their previous values.
    ///
    /// # Panics
    ///
    /// Panics if `snapshot` is consumed out of stack order.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut vec = IdSnapshotVec::<NodeId, i32>::new();
    /// let id = vec.push(100);
    ///
    /// let snap = vec.snapshot();
    /// vec.set(id, 999);
    /// vec.push(200);
    /// vec.push(300);
    ///
    /// // All three mutations are undone at once.
    /// vec.rollback_to(snap);
    /// assert_eq!(vec.len(), 1);
    /// assert_eq!(vec[id], 100);
    /// ```
    #[inline]
    pub fn rollback_to(&mut self, snapshot: Snapshot) {
        self.log.rollback(snapshot, &mut self.inner);
    }

    /// Keeps all changes made since `snapshot` was created.
    ///
    /// If this is the outermost snapshot, the undo log is cleared. Otherwise, the entries remain
    /// available for an outer rollback.
    ///
    /// # Panics
    ///
    /// Panics if `snapshot` is consumed out of stack order.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut vec = IdSnapshotVec::<NodeId, i32>::new();
    /// vec.push(1);
    ///
    /// let outer = vec.snapshot();
    /// vec.push(2);
    ///
    /// let inner = vec.snapshot();
    /// vec.push(3);
    /// vec.commit(inner); // keeps `3`, but outer snapshot can still undo it
    ///
    /// vec.rollback_to(outer);
    /// assert_eq!(vec.len(), 1);
    /// assert_eq!(vec[NodeId::new(0)], 1);
    /// ```
    #[inline]
    pub fn commit(&mut self, snapshot: Snapshot) {
        self.log.commit(snapshot);
    }

    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut vec = IdSnapshotVec::<NodeId, i32>::new();
    /// vec.push(10);
    /// vec.push(20);
    ///
    /// let slice = vec.as_slice();
    /// assert_eq!(slice[NodeId::new(0)], 10);
    /// assert_eq!(slice.len(), 2);
    /// ```
    #[inline]
    #[must_use]
    pub fn as_slice(&self) -> &IdSlice<I, T> {
        &self.inner
    }
}

/// Map-like APIs for `IdSnapshotVec<I, Option<T>>`.
#[coverage(off)]
impl<I, T, S: UndoStrategy<I, Option<T>>, A: Allocator> IdSnapshotVec<I, Option<T>, S, A>
where
    I: Id,
{
    /// Extends the vector with `None` until it can hold `index`. Each appended element is
    /// individually tracked for rollback, so the extension is fully reversible.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct MyId(u32 is 0..=100));
    ///
    /// let mut vec = IdSnapshotVec::<MyId, Option<i32>>::new();
    ///
    /// let snap = vec.snapshot();
    /// vec.fill_until(MyId::new(3));
    /// assert_eq!(vec.len(), 4);
    /// assert!(vec[MyId::new(0)].is_none());
    ///
    /// vec.rollback_to(snap);
    /// assert!(vec.is_empty());
    /// ```
    pub fn fill_until(&mut self, index: I) {
        let new_length = index.as_usize() + 1;

        while self.inner.len() < new_length {
            self.push(None);
        }
    }

    /// Inserts a value at the given ID index, expanding the vector with `None` if necessary.
    ///
    /// All extensions and the replacement are tracked for rollback.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{Id as _, newtype, snapshot_vec::IdSnapshotVec};
    ///
    /// newtype!(struct MyId(u32 is 0..=100));
    ///
    /// let mut vec = IdSnapshotVec::<MyId, Option<String>>::new();
    ///
    /// let snap = vec.snapshot();
    /// vec.insert(MyId::new(2), "hello".to_string());
    /// assert_eq!(vec.len(), 3);
    /// assert_eq!(vec[MyId::new(2)].as_deref(), Some("hello"));
    ///
    /// vec.rollback_to(snap);
    /// assert!(vec.is_empty());
    /// ```
    pub fn insert(&mut self, index: I, value: T) -> Option<T>
    where
        T: Clone,
    {
        self.fill_until(index);

        self.set(index, Some(value))
    }
}

impl<I, T, S: UndoStrategy<I, T>> Default for IdSnapshotVec<I, T, S>
where
    I: Id,
{
    #[inline]
    fn default() -> Self {
        Self {
            inner: IdVec::new(),
            log: Log::new(),
        }
    }
}

impl<I, T, S: UndoStrategy<I, T>, A: Allocator> Deref for IdSnapshotVec<I, T, S, A>
where
    I: Id,
{
    type Target = IdSlice<I, T>;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl<I, T, S: UndoStrategy<I, T>, A: Allocator> Borrow<IdSlice<I, T>> for IdSnapshotVec<I, T, S, A>
where
    I: Id,
{
    #[inline]
    fn borrow(&self) -> &IdSlice<I, T> {
        self
    }
}

impl<I, T, S: UndoStrategy<I, T>, A: Allocator> IntoIterator for IdSnapshotVec<I, T, S, A>
where
    I: Id,
{
    type IntoIter = vec::IntoIter<T, A>;
    type Item = T;

    #[inline]
    fn into_iter(self) -> Self::IntoIter {
        self.inner.into_iter()
    }
}

impl<I, T, S: UndoStrategy<I, T>, A: Allocator> PartialEq for IdSnapshotVec<I, T, S, A>
where
    T: PartialEq,
{
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.inner == other.inner
    }
}

impl<I, T, S: UndoStrategy<I, T>, A: Allocator> Eq for IdSnapshotVec<I, T, S, A> where T: Eq {}

impl<I, T, S: UndoStrategy<I, T>, A: Allocator> Hash for IdSnapshotVec<I, T, S, A>
where
    T: Hash,
{
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.inner.hash(state);
    }
}

impl<I, T, S: UndoStrategy<I, T>, A: Allocator> Debug for IdSnapshotVec<I, T, S, A>
where
    T: Debug,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(&self.inner, fmt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    crate::id::newtype!(#[id(crate = crate)] struct TestId(u32 is 0..=1000));

    #[test]
    fn nested_snapshots() {
        let mut vec = IdSnapshotVec::<TestId, i32>::new();
        vec.push(1);

        let outer = vec.snapshot();
        vec.push(2);

        let inner = vec.snapshot();
        vec.push(3);
        vec.set(TestId::new(0), 99);
        assert_eq!(vec.len(), 3);

        vec.rollback_to(inner);
        assert_eq!(vec.len(), 2);
        assert_eq!(vec[TestId::new(0)], 1);
        assert_eq!(vec[TestId::new(1)], 2);

        vec.rollback_to(outer);
        assert_eq!(vec.len(), 1);
        assert_eq!(vec[TestId::new(0)], 1);
    }

    #[test]
    fn no_snapshot_no_tracking() {
        let mut vec = IdSnapshotVec::<TestId, i32>::new();
        vec.push(1);
        vec.push(2);
        vec.set(TestId::new(0), 99);

        assert_eq!(vec.log.tape.len(), 0);
    }

    #[test]
    #[should_panic(expected = "no open snapshot")]
    fn double_commit_panics() {
        let mut vec = IdSnapshotVec::<TestId, i32>::new();
        let snap = vec.snapshot();
        vec.commit(snap);

        vec.commit(Snapshot { tape_len: 0 });
    }

    #[test]
    fn empty_snapshot_roundtrip() {
        let mut vec = IdSnapshotVec::<TestId, i32>::new();

        let snap = vec.snapshot();
        vec.rollback_to(snap);
        assert!(vec.is_empty());

        let snap = vec.snapshot();
        vec.commit(snap);
        assert!(vec.is_empty());
    }
}
