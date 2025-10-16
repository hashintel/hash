//! Union-find (disjoint-set) data structure for [`Id`] types.
//!
//! This module provides [`IdUnionFind`], a specialized implementation of the union-find
//! algorithm optimized for [`Id`] types. It uses path splitting for path compression and
//! union by rank for efficient merging operations.
//!
//! # Algorithm
//!
//! The implementation uses two key optimizations:
//!
//! - **Path splitting**: A simpler form of path compression that makes each node point to its
//!   grandparent during traversal, achieving near-constant amortized time complexity.
//! - **Union by rank**: Always attaches the tree with lower rank to the root of the tree with
//!   higher rank, keeping trees balanced.
//!
//! These optimizations together provide nearly constant amortized time complexity for both
//! [`find`] and [`unify`] operations.
//!
//! # Examples
//!
//! Basic usage with a custom ID type:
//!
//! ```
//! use hashql_core::id::{newtype, IdUnionFind};
//!
//! // Define a custom ID type
//! newtype!(struct NodeId(u32 is 0..=1000));
//!
//! // Create a union-find structure with 5 elements
//! let mut uf = IdUnionFind::<NodeId>::new(5);
//!
//! // Initially, each element is in its own set
//! let id0 = NodeId::new(0);
//! let id1 = NodeId::new(1);
//! let id2 = NodeId::new(2);
//!
//! assert!(!uf.equiv(id0, id1));
//! assert!(!uf.equiv(id1, id2));
//!
//! // Unify elements 0 and 1
//! uf.unify(id0, id1);
//! assert!(uf.equiv(id0, id1));
//!
//! // Unify elements 1 and 2 (transitively connects 0 and 2)
//! uf.unify(id1, id2);
//! assert!(uf.equiv(id0, id2));
//!
//! // Check the size of the set containing element 0
//! assert_eq!(uf.size(id0), 3);
//! ```
//!
//! [`find`]: IdUnionFind::find
//! [`unify`]: IdUnionFind::unify

use alloc::alloc::Global;
use core::{alloc::Allocator, mem};

use super::{Id, IdVec};

struct Entry<I> {
    /// Parent node in the tree
    ///
    /// If the node is a root, it points to itself.
    parent: I,
    /// Upper bound on the tree height (used for union by rank)
    rank: u32,
    // We do not track the size of the set containing this element on purpose, if we would the size
    // of an entry go from 8 bytes to 12 bytes. While not significant at first, considering we
    // don't use the size (and we can add it later if needed), the savings is significant if the
    // set gets large enough.
}

/// A union-find (disjoint-set) data structure specialized for [`Id`] types.
///
/// More information about disjoint-set data structures can be found at [Wikipedia](https://en.wikipedia.org/wiki/Disjoint-set_data_structure).
///
/// # Performance
///
/// All operations have nearly constant amortized time complexity `O(α(n))`, where α is
/// the inverse Ackermann function. In practice, this is effectively constant time for
/// any reasonable input size.
///
/// See [doi/10.1145/62.2160](https://doi.org/10.1145/62.2160)
///
/// The space complexity is O(n) where n is the number of elements.
pub struct IdUnionFind<I, A: Allocator = Global> {
    entries: IdVec<I, Entry<I>, A>,
}

impl<I> IdUnionFind<I>
where
    I: Id,
{
    /// Creates a new union-find structure with the specified number of elements.
    ///
    /// Each element is initially in its own singleton set.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{newtype, IdUnionFind};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut uf = IdUnionFind::<NodeId>::new(10);
    ///
    /// // Each element starts in its own set with size 1
    /// let id0 = NodeId::new(0);
    /// let id5 = NodeId::new(5);
    ///
    /// assert_eq!(uf.size(id0), 1);
    /// assert_eq!(uf.size(id5), 1);
    /// assert!(!uf.equiv(id0, id5));
    /// ```
    #[inline]
    #[must_use]
    pub fn new(size: usize) -> Self {
        Self::new_in(size, Global)
    }
}

impl<I, A> IdUnionFind<I, A>
where
    I: Id,
    A: Allocator,
{
    /// Creates a new union-find structure with the specified number of elements and
    /// allocator.
    ///
    /// This is the allocator-aware version of [`new`]. Each element is initially in its
    /// own singleton set.
    ///
    /// # Examples
    ///
    /// ```
    /// #![feature(allocator_api)]
    /// use hashql_core::id::{newtype, IdUnionFind};
    /// use std::alloc::Global;
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut uf = IdUnionFind::<NodeId, _>::new_in(10, Global);
    ///
    /// let id0 = NodeId::new(0);
    /// assert_eq!(uf.size(id0), 1);
    /// ```
    ///
    /// [`new`]: IdUnionFind::new
    #[must_use]
    pub fn new_in(size: usize, alloc: A) -> Self {
        Self {
            entries: IdVec::from_fn_in(
                size,
                |key| Entry {
                    parent: key,
                    rank: 0,
                },
                alloc,
            ),
        }
    }

    /// Finds the representative (root) element of the set containing the given element.
    ///
    /// This operation performs path compression, meaning that subsequent operations on the same
    /// paths are faster.
    ///
    /// # Performance
    ///
    /// Nearly constant amortized time `O(α(n))`, where α is the inverse Ackermann function.
    ///
    /// # Panics
    ///
    /// Panics if `key` is outside the valid range `0..size`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{newtype, IdUnionFind};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut uf = IdUnionFind::<NodeId>::new(5);
    /// let id0 = NodeId::new(0);
    /// let id1 = NodeId::new(1);
    /// let id2 = NodeId::new(2);
    ///
    /// // Before unification, each element is its own representative
    /// assert_eq!(uf.find(id0), id0);
    /// assert_eq!(uf.find(id1), id1);
    ///
    /// // After unification, both elements have the same representative
    /// uf.unify(id0, id1);
    /// assert_eq!(uf.find(id0), uf.find(id1));
    ///
    /// // Transitive unification
    /// uf.unify(id1, id2);
    /// assert_eq!(uf.find(id0), uf.find(id2));
    /// ```
    pub fn find(&mut self, key: I) -> I {
        // Path compression using path splitting: as we traverse from the element to the
        // root, we make each node point to its grandparent. This is simpler than full path
        // compression (making all nodes point directly to the root) but still provides
        // excellent amortized performance.
        // See: doi:10.1145/62.2160
        let mut current = key;

        // Traverse upward until we reach the root
        while current != self.entries[current].parent {
            let parent = self.entries[current].parent;

            // Path splitting: make current point to its grandparent
            let grandparent = self.entries[parent].parent;
            self.entries[current].parent = grandparent;

            // Move up to the parent for the next iteration
            current = parent;
        }

        current
    }

    /// Merges the sets containing the two given elements.
    ///
    /// Returns the representative element of the merged set.
    ///
    /// This operation performs path compression as a side effect, making subsequent operations on
    /// the same elements faster.
    ///
    /// # Performance
    ///
    /// Nearly constant amortized time `O(α(n))`, where α is the inverse Ackermann function.
    ///
    /// # Panics
    ///
    /// Panics if either `lhs` or `rhs` is outside the valid range `0..size`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{newtype, IdUnionFind};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut uf = IdUnionFind::<NodeId>::new(5);
    /// let id0 = NodeId::new(0);
    /// let id1 = NodeId::new(1);
    /// let id2 = NodeId::new(2);
    ///
    /// // Unify elements 0 and 1
    /// let root = uf.unify(id0, id1);
    /// assert_eq!(uf.find(id0), root);
    /// assert_eq!(uf.find(id1), root);
    ///
    /// // Unify the merged set with element 2
    /// let new_root = uf.unify(id0, id2);
    /// assert_eq!(uf.find(id0), new_root);
    /// assert_eq!(uf.find(id1), new_root);
    /// assert_eq!(uf.find(id2), new_root);
    ///
    /// // Unifying already-unified elements returns the existing root
    /// assert_eq!(uf.unify(id0, id1), new_root);
    /// ```
    pub fn unify(&mut self, lhs: I, rhs: I) -> I {
        // First, find the representatives of both sets
        let mut lhs = self.find(lhs);
        let mut rhs = self.find(rhs);

        if lhs == rhs {
            // The elements are already in the same set
            return lhs;
        }

        // Union by rank: ensure lhs has rank at least as large as rhs.
        // This keeps trees balanced.
        if self.entries[lhs].rank < self.entries[rhs].rank {
            mem::swap(&mut lhs, &mut rhs);
        }

        // Make lhs the parent of rhs, merging the sets
        self.entries[rhs].parent = lhs;

        // When both ranks are equal, the merged tree's height increases by one
        if self.entries[lhs].rank == self.entries[rhs].rank {
            self.entries[lhs].rank += 1;
        }

        lhs
    }

    /// Checks whether two elements are in the same set (equivalence class).
    ///
    /// Returns `true` if the elements belong to the same set, `false` otherwise.
    ///
    /// This operation performs path compression as a side effect, making subsequent operations on
    /// the same elements faster.
    ///
    /// # Performance
    ///
    /// Nearly constant amortized time `O(α(n))`, where α is the inverse Ackermann function.
    ///
    /// # Panics
    ///
    /// Panics if either `lhs` or `rhs` is outside the valid range `0..size`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{newtype, IdUnionFind};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut uf = IdUnionFind::<NodeId>::new(5);
    /// let id0 = NodeId::new(0);
    /// let id1 = NodeId::new(1);
    /// let id2 = NodeId::new(2);
    ///
    /// // Initially, elements are not equivalent
    /// assert!(!uf.equiv(id0, id1));
    ///
    /// // After unification, elements are equivalent
    /// uf.unify(id0, id1);
    /// assert!(uf.equiv(id0, id1));
    ///
    /// // Equivalence is transitive
    /// uf.unify(id1, id2);
    /// assert!(uf.equiv(id0, id2));
    ///
    /// // Equivalence is reflexive
    /// assert!(uf.equiv(id0, id0));
    /// ```
    pub fn equiv(&mut self, lhs: I, rhs: I) -> bool {
        self.find(lhs) == self.find(rhs)
    }

    /// Resets the union-find structure to its initial state.
    ///
    /// After calling this method, each element will be in its own singleton set,
    /// as if the structure was just created with [`new`] or [`new_in`].
    ///
    /// # Performance
    ///
    /// Linear time `O(n)` where n is the number of elements.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::id::{newtype, IdUnionFind};
    ///
    /// newtype!(struct NodeId(u32 is 0..=1000));
    ///
    /// let mut uf = IdUnionFind::<NodeId>::new(3);
    /// let id0 = NodeId::new(0);
    /// let id1 = NodeId::new(1);
    /// let id2 = NodeId::new(2);
    ///
    /// // Perform some operations
    /// uf.unify(id0, id1);
    /// uf.unify(id1, id2);
    /// assert!(uf.equiv(id0, id2));
    ///
    /// // Reset to initial state
    /// uf.reset();
    ///
    /// // Elements are now in separate sets again
    /// assert!(!uf.equiv(id0, id1));
    /// assert!(!uf.equiv(id1, id2));
    /// assert!(!uf.equiv(id0, id2));
    /// ```
    ///
    /// [`new`]: IdUnionFind::new
    /// [`new_in`]: IdUnionFind::new_in
    pub fn reset(&mut self) {
        for (id, entry) in self.entries.iter_enumerated_mut() {
            entry.parent = id;
            entry.rank = 0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Define a test ID type
    crate::id::newtype!(struct TestId(u32 is 0..=1000));

    #[test]
    fn path_compression() {
        let mut uf = IdUnionFind::<TestId>::new(4);
        let id0 = TestId::new(0);
        let id1 = TestId::new(1);
        let id2 = TestId::new(2);
        let id3 = TestId::new(3);

        // Create a chain: 0 -> 1 -> 2 -> 3
        uf.unify(id0, id1);
        uf.unify(id1, id2);
        uf.unify(id2, id3);

        // First find on id0 should compress the path
        let root = uf.find(id0);

        assert_eq!(uf.entries[id0].parent, root);
        assert_eq!(uf.entries[id1].parent, root);
        assert_eq!(uf.entries[id2].parent, root);
        assert_eq!(uf.entries[id3].parent, root);
    }
}
