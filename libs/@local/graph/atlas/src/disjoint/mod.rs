//! Disjoint-set forests over dense index domains.
//!
//! A [`DisjointSet`] partitions the indices `0..len` into groups that
//! merge pairwise: every index starts alone, [`unite`](DisjointSet::unite)
//! joins two indices' groups, and [`find`](DisjointSet::find) names any
//! index's group by a representative index that stays stable until the
//! group merges again. A sequence of `u` unions and `f` finds costs
//! `O((u + f) alpha(len))` with the inverse-Ackermann factor below 5
//! for every physical input, so connected components over an edge list
//! cost one pass over the edges.
//!
//! # Examples
//!
//! ```
//! use hash_graph_atlas::disjoint::DisjointSet;
//!
//! let mut components = DisjointSet::new(4);
//! assert!(components.unite(0, 1));
//! assert!(components.unite(2, 3));
//! assert!(!components.unite(1, 0), "already one group");
//! assert_eq!(components.find(0), components.find(1));
//! assert_ne!(components.find(1), components.find(2));
//! assert_eq!(components.groups(), 2);
//! ```

#[cfg(test)]
mod tests;

/// A union-find partition of the indices `0..len`.
///
/// Uses path halving and union by size, so both operations run in
/// effectively constant amortized time.
#[derive(Debug, Clone)]
pub struct DisjointSet {
    // parent[i] == i marks a representative; size is meaningful only
    // at representatives.
    parent: Vec<u32>,
    size: Vec<u32>,
    groups: usize,
}

impl DisjointSet {
    /// Creates the discrete partition of `0..len`: every index alone.
    ///
    /// # Panics
    ///
    /// Panics when `len` exceeds the `u32` index encoding.
    #[must_use]
    pub fn new(len: usize) -> Self {
        assert!(
            u32::try_from(len).is_ok(),
            "the index domain is bound to a u32 encoding",
        );
        #[expect(
            clippy::cast_possible_truncation,
            reason = "the assert above bounds the domain to u32"
        )]
        Self {
            parent: (0..len as u32).collect(),
            size: vec![1; len],
            groups: len,
        }
    }

    /// Returns the domain length the partition covers.
    #[inline]
    #[must_use]
    pub const fn len(&self) -> usize {
        self.parent.len()
    }

    /// Returns whether the domain is empty.
    #[inline]
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.parent.is_empty()
    }

    /// Returns the current group count.
    #[inline]
    #[must_use]
    pub const fn groups(&self) -> usize {
        self.groups
    }

    /// Returns `index`'s group representative.
    ///
    /// Two indices share a group exactly when their representatives are
    /// equal at the same partition state.
    ///
    /// # Panics
    ///
    /// Panics when `index` lies outside the domain.
    #[must_use]
    pub const fn find(&mut self, index: u32) -> u32 {
        let mut current = index;
        loop {
            let parent = self.parent[current as usize];
            if parent == current {
                return current;
            }

            // Path halving: point every visited index at its
            // grandparent, halving the path for later finds.
            let grandparent = self.parent[parent as usize];
            self.parent[current as usize] = grandparent;
            current = grandparent;
        }
    }

    /// Merges the groups of `one` and `other`.
    ///
    /// Returns whether a merge happened; two indices already sharing a
    /// group leave the partition unchanged.
    ///
    /// # Panics
    ///
    /// Panics when either index lies outside the domain.
    pub const fn unite(&mut self, one: u32, other: u32) -> bool {
        let mut first = self.find(one);
        let mut second = self.find(other);
        if first == second {
            return false;
        }

        // Union by size: the smaller group's representative points at
        // the larger group's, keeping find paths logarithmic before
        // halving.
        if self.size[first as usize] < self.size[second as usize] {
            core::mem::swap(&mut first, &mut second);
        }

        self.parent[second as usize] = first;
        self.size[first as usize] += self.size[second as usize];
        self.groups -= 1;
        true
    }

    /// Returns the size of `index`'s group.
    ///
    /// # Panics
    ///
    /// Panics when `index` lies outside the domain.
    #[must_use]
    pub const fn group_size(&mut self, index: u32) -> u32 {
        let representative = self.find(index);
        self.size[representative as usize]
    }
}
