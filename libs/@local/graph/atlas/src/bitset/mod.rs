//! Fixed-capacity dense bit sets over row domains.
//!
//! [`BitSet`] marks membership over a dense zero-based index domain in
//! one bit per index - an eighth of a `Vec<bool>` - packed into `u64`
//! words, so iteration skips absent runs sixty-four indices at a time.
//! The capacity is fixed at construction: the set answers for exactly
//! the indices below it and panics beyond, like a slice.

#[cfg(test)]
mod tests;

/// A fixed-capacity set of dense indices, one bit per index.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::bitset::BitSet;
///
/// let mut selected = BitSet::new(100);
/// selected.insert(3);
/// selected.insert(97);
///
/// assert!(selected.contains(3));
/// assert!(!selected.contains(4));
/// assert_eq!(selected.iter().collect::<Vec<_>>(), [3, 97]);
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BitSet {
    words: Box<[u64]>,
    len: usize,
}

impl BitSet {
    /// Bits per storage word.
    const WORD: usize = u64::BITS as usize;
    /// Mask selecting an index's bit within its word.
    const WORD_MASK: usize = Self::WORD - 1;
    /// Shift selecting an index's word: `index >> WORD_SHIFT`.
    const WORD_SHIFT: usize = (u64::BITS - 1).count_ones() as usize;

    /// Creates an empty set over the indices below `len`.
    #[must_use]
    pub fn new(len: usize) -> Self {
        Self {
            words: vec![0; len.div_ceil(Self::WORD)].into_boxed_slice(),
            len,
        }
    }

    /// Returns the capacity: the set answers for indices below it.
    #[inline]
    #[must_use]
    pub const fn len(&self) -> usize {
        self.len
    }

    /// Returns whether the capacity is zero.
    #[inline]
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Returns whether `index` is in the set.
    ///
    /// # Panics
    ///
    /// Panics when `index` is at or beyond the capacity.
    #[inline]
    #[must_use]
    pub const fn contains(&self, index: usize) -> bool {
        assert!(index < self.len, "the index lies beyond the capacity");
        self.words[index >> Self::WORD_SHIFT] & (1 << (index & Self::WORD_MASK)) != 0
    }

    /// Inserts `index` into the set.
    ///
    /// # Panics
    ///
    /// Panics when `index` is at or beyond the capacity.
    #[inline]
    pub const fn insert(&mut self, index: usize) {
        assert!(index < self.len, "the index lies beyond the capacity");
        self.words[index >> Self::WORD_SHIFT] |= 1 << (index & Self::WORD_MASK);
    }

    /// Returns the number of indices in the set.
    #[must_use]
    pub fn count(&self) -> usize {
        self.words
            .iter()
            .map(|&word| word.count_ones() as usize)
            .sum()
    }

    /// Iterates the set's indices in ascending order.
    pub fn iter(&self) -> impl Iterator<Item = usize> + '_ {
        self.words.iter().enumerate().flat_map(|(position, &word)| {
            let base = position * Self::WORD;
            let mut remaining = word;
            core::iter::from_fn(move || {
                if remaining == 0 {
                    return None;
                }

                let bit = remaining.trailing_zeros() as usize;
                remaining &= remaining - 1;
                Some(base + bit)
            })
        })
    }
}
