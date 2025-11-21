use alloc::{alloc::Global, collections::VecDeque};
use core::alloc::Allocator;

use crate::id::{Id, bit_vec::DenseBitSet};

/// A work queue that prevents duplicate items from being enqueued simultaneously.
///
/// This queue automatically deduplicates items: no item will be in the queue multiple times at any
/// given time. Attempting to enqueue an item that is already in the queue will be rejected.
///
/// This makes it ideal for work scheduling where fixed-point iteration is required.
///
/// Items are dequeued in FIFO order (first in, first out) and the implementation assumes dense
/// indices.
///
/// # Examples
///
/// ```
/// use hashql_core::collections::WorkQueue;
/// # hashql_core::id::newtype!(pub struct MyId(u32 is 0..=100));
///
/// let mut queue = WorkQueue::new(100);
///
/// assert!(queue.enqueue(MyId::new(5)));
/// assert!(queue.enqueue(MyId::new(10)));
///
/// // Duplicate enqueue fails
/// assert!(!queue.enqueue(MyId::new(5)));
///
/// // Items are dequeued in FIFO order
/// assert_eq!(queue.dequeue(), Some(MyId::new(5)));
/// assert_eq!(queue.dequeue(), Some(MyId::new(10)));
/// assert_eq!(queue.dequeue(), None);
/// ```
pub struct WorkQueue<I, A: Allocator = Global> {
    queue: VecDeque<I, A>,
    set: DenseBitSet<I>,
}

impl<I> WorkQueue<I>
where
    I: Id,
{
    /// Creates a new empty work queue.
    ///
    /// The `domain_size` specifies the maximum number of unique items that can be enqueued.
    /// All item IDs must be in the range `0..domain_size`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::collections::WorkQueue;
    /// # hashql_core::id::newtype!(pub struct MyId(u32 is 0..=100));
    ///
    /// // Create a queue supporting up to 100 unique items
    /// let queue = WorkQueue::new(100);
    /// # let _: WorkQueue<MyId> = queue;
    /// ```
    #[must_use]
    pub fn new(domain_size: usize) -> Self {
        Self::new_in(domain_size, Global)
    }
}

impl<I, A: Allocator> WorkQueue<I, A>
where
    I: Id,
{
    /// Creates a new empty work queue with a custom allocator.
    ///
    /// The `domain_size` specifies the maximum number of unique items that can be enqueued.
    /// All item IDs must be in the range `0..domain_size`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::collections::WorkQueue;
    /// # use hashql_core::heap::Heap;
    /// # hashql_core::id::newtype!(pub struct MyId(u32 is 0..=100));
    /// # let heap = Heap::new();
    ///
    /// let queue = WorkQueue::new_in(100, &heap);
    /// # let _: WorkQueue<MyId, _> = queue;
    /// ```
    #[must_use]
    pub fn new_in(domain_size: usize, alloc: A) -> Self {
        Self {
            queue: VecDeque::new_in(alloc),
            set: DenseBitSet::new_empty(domain_size),
        }
    }

    /// Attempts to enqueue an item if it's not already in the queue.
    ///
    /// Returns `true` if the `item` was successfully added, or `false` if the item
    /// is already present in the queue.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::collections::WorkQueue;
    /// # hashql_core::id::newtype!(pub struct MyId(u32 is 0..=100));
    ///
    /// let mut queue = WorkQueue::new(100);
    ///
    /// assert!(queue.enqueue(MyId::new(1))); // Added
    /// assert!(!queue.enqueue(MyId::new(1))); // Already in queue - rejected
    ///
    /// assert_eq!(queue.dequeue(), Some(MyId::new(1))); // Remove item 1
    /// assert!(queue.enqueue(MyId::new(1))); // Can be added again
    /// ```
    pub fn enqueue(&mut self, item: I) -> bool {
        if self.set.insert(item) {
            self.queue.push_back(item);
            true
        } else {
            false
        }
    }

    /// Removes and returns the next item from the queue.
    ///
    /// Returns [`None`] if the queue is empty.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::collections::WorkQueue;
    /// # hashql_core::id::newtype!(pub struct MyId(u32 is 0..=100));
    ///
    /// let mut queue = WorkQueue::new(100);
    ///
    /// queue.enqueue(MyId::new(1));
    /// queue.enqueue(MyId::new(2));
    ///
    /// assert_eq!(queue.dequeue(), Some(MyId::new(1)));
    /// assert_eq!(queue.dequeue(), Some(MyId::new(2)));
    /// assert_eq!(queue.dequeue(), None);
    /// ```
    pub fn dequeue(&mut self) -> Option<I> {
        let element = self.queue.pop_front()?;
        self.set.remove(element);

        Some(element)
    }
}
