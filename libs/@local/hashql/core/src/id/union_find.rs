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
//! ```
//!
//! [`find`]: IdUnionFind::find
//! [`unify`]: IdUnionFind::unify

use alloc::alloc::Global;
use core::{alloc::Allocator, mem};

use super::{Id, IdVec};

struct Entry<I> {
    /// Parent node in the tree.
    ///
    /// If the node is a root, it points to itself.
    parent: I,
    /// Upper bound on the tree height (used for union by rank).
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
/// See [doi/10.1145/62.2160](https://doi.org/10.1145/62.2160).
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
    /// // Starting out elements are not equivalent to each other
    /// let id0 = NodeId::new(0);
    /// let id5 = NodeId::new(5);
    ///
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
    /// // Starting out elements are not equivalent to each other
    /// let id0 = NodeId::new(0);
    /// let id5 = NodeId::new(5);
    ///
    /// assert!(!uf.equiv(id0, id5));
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
    #![expect(clippy::similar_names, reason = "test code")]
    use super::*;

    // Define a test ID type
    crate::id::newtype!(
        #[id(crate = crate)]
        struct TestId(u32 is 0..=1000)
    );

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

    #[test]
    fn empty_union_find() {
        let uf = IdUnionFind::<TestId>::new(0);
        assert_eq!(uf.entries.len(), 0);
    }

    #[test]
    fn path_compression_reduces_depth() {
        let mut uf = IdUnionFind::<TestId>::new(8);
        let ids: Vec<_> = (0..8).map(TestId::new).collect();

        // Build a deliberately deep chain: 0 <- 1 <- 2 <- 3 <- 4 <- 5 <- 6 <- 7
        // This creates maximum depth without path compression
        for i in 1..8 {
            uf.entries[ids[i - 1]].parent = ids[i];
        }

        // Before compression: id0 requires 7 hops to reach root (id7)
        // Manually verify the deep structure
        assert_eq!(uf.entries[ids[0]].parent, ids[1]);
        assert_eq!(uf.entries[ids[1]].parent, ids[2]);
        assert_eq!(uf.entries[ids[6]].parent, ids[7]);
        assert_eq!(uf.entries[ids[7]].parent, ids[7]); // root

        // After path compression via find(), paths should be much shorter
        let root = uf.find(ids[0]);
        assert_eq!(root, ids[7]);

        // Path compression should have shortened paths significantly
        // With path splitting, nodes should now point to their grandparents or closer
        let path_length_after = {
            let mut current = ids[0];
            let mut hops = 0;
            while current != uf.entries[current].parent {
                current = uf.entries[current].parent;
                hops += 1;
                if hops > 8 {
                    break;
                } // Safety check
            }
            hops
        };

        // Path should be significantly shorter than original 7 hops
        assert!(
            path_length_after < 7,
            "Expected path compression, but path length is {path_length_after}"
        );
    }

    #[test]
    fn union_by_rank_prevents_degenerate_trees() {
        let mut uf = IdUnionFind::<TestId>::new(16);
        let ids: Vec<_> = (0..16).map(TestId::new).collect();

        // Build a balanced binary tree bottom-up using union-by-rank
        // This should create a tree with logarithmic height
        let mut current_level = ids.clone();

        while current_level.len() > 1 {
            let mut next_level = Vec::new();

            // Pair up nodes and union them
            for i in (0..current_level.len()).step_by(2) {
                if i + 1 < current_level.len() {
                    let root = uf.unify(current_level[i], current_level[i + 1]);
                    next_level.push(root);
                } else {
                    // Odd node carries to next level
                    next_level.push(current_level[i]);
                }
            }

            current_level = next_level;
        }

        let final_root = current_level[0];

        // With union-by-rank, the tree height should be logarithmic
        // For 16 elements, rank should be at most log2(16) = 4
        assert!(
            uf.entries[final_root].rank <= 4,
            "Expected rank <= 4, got {}",
            uf.entries[final_root].rank
        );

        // Verify all elements are connected
        for &id in &ids {
            assert_eq!(uf.find(id), final_root);
        }
    }

    #[test]
    fn union_by_rank_equal_ranks_increase_rank() {
        let mut uf = IdUnionFind::<TestId>::new(8);
        let ids: Vec<_> = (0..8).map(TestId::new).collect();

        // Create two rank-1 trees
        let tree1 = uf.unify(ids[0], ids[1]); // rank 1
        let tree2 = uf.unify(ids[2], ids[3]); // rank 1
        assert_eq!(uf.entries[tree1].rank, 1);
        assert_eq!(uf.entries[tree2].rank, 1);

        // Union equal-rank trees - rank should increase
        let combined = uf.unify(tree1, tree2); // rank 2
        assert_eq!(uf.entries[combined].rank, 2);

        // Create another rank-2 tree
        let tree3 = uf.unify(ids[4], ids[5]); // rank 1
        let tree4 = uf.unify(ids[6], ids[7]); // rank 1
        let tree34 = uf.unify(tree3, tree4); // rank 2
        assert_eq!(uf.entries[tree34].rank, 2);

        // Union two rank-2 trees - rank should increase to 3
        let final_root = uf.unify(combined, tree34);
        assert_eq!(uf.entries[final_root].rank, 3);
    }

    #[test]
    fn union_by_rank_different_ranks_preserve_rank() {
        let mut uf = IdUnionFind::<TestId>::new(5);
        let ids: Vec<_> = (0..5).map(TestId::new).collect();

        // Create rank-2 tree: ((0,1), (2,3))
        let rank1_a = uf.unify(ids[0], ids[1]); // rank 1
        let rank1_b = uf.unify(ids[2], ids[3]); // rank 1
        let rank2_tree = uf.unify(rank1_a, rank1_b); // rank 2
        assert_eq!(uf.entries[rank2_tree].rank, 2);

        // Union with rank-0 element (ids[4] is still singleton)
        let combined = uf.unify(rank2_tree, ids[4]); // should stay rank 2
        assert_eq!(combined, rank2_tree); // Higher rank tree becomes root
        assert_eq!(uf.entries[combined].rank, 2); // Rank unchanged
    }

    #[test]
    fn unify_already_connected_elements_preserves_structure() {
        let mut uf = IdUnionFind::<TestId>::new(4);
        let ids: Vec<_> = (0..4).map(TestId::new).collect();

        // Build initial structure
        let root1 = uf.unify(ids[0], ids[1]);
        let final_root = uf.unify(root1, ids[2]);

        let initial_rank = uf.entries[final_root].rank;
        let initial_structure: Vec<_> = (0..4).map(|i| uf.entries[ids[i]].parent).collect();

        // Unify already-connected elements multiple times
        for _ in 0..5 {
            let returned_root = uf.unify(ids[0], ids[2]);
            assert_eq!(returned_root, final_root);
            assert_eq!(uf.entries[final_root].rank, initial_rank); // Rank unchanged
        }

        // Structure should be unchanged
        let final_structure: Vec<_> = (0..4).map(|i| uf.entries[ids[i]].parent).collect();
        assert_eq!(initial_structure, final_structure);
    }

    #[test]
    fn reset_functionality() {
        let mut uf = IdUnionFind::<TestId>::new(4);
        let ids: Vec<_> = (0..4).map(TestId::new).collect();

        // Build complex structure with various ranks
        uf.unify(ids[0], ids[1]);
        uf.unify(ids[2], ids[3]);
        let final_root = uf.unify(ids[0], ids[2]);

        // Verify complex state
        assert!(uf.entries[final_root].rank > 0);
        assert!(uf.equiv(ids[0], ids[3]));

        // Reset should restore initial state
        uf.reset();

        // Every element should be its own parent with rank 0
        for &id in &ids {
            assert_eq!(uf.entries[id].parent, id);
            assert_eq!(uf.entries[id].rank, 0);
            assert_eq!(uf.find(id), id);
        }

        // No elements should be equivalent
        for i in 0..4 {
            for j in i + 1..4 {
                assert!(!uf.equiv(ids[i], ids[j]));
            }
        }
    }
}
