//! Generic block-partitioned storage.
//!
//! Provides a flat data array with a block-offset table, so that per-element values can be
//! accessed by block ID. Each block owns a contiguous slice of the array, sized by the count
//! provided at construction time.
//!
//! Used as the backing store for both per-statement cost maps and per-edge terminator matrices.

use core::{alloc::Allocator, iter};

use hashql_core::id::Id as _;

use crate::body::basic_block::{BasicBlockId, BasicBlockSlice};

/// Dense block-partitioned storage.
///
/// Stores a flat array of `T` values, partitioned into per-block slices via an offset table.
/// Each [`BasicBlockId`] maps to a contiguous range within the data array. The per-block count
/// is determined at construction time and can be rebuilt via [`remap`](Self::remap).
#[derive(Debug)]
pub(crate) struct BlockPartitionedVec<T, A: Allocator = alloc::alloc::Global> {
    offsets: Box<BasicBlockSlice<u32>, A>,
    data: Vec<T, A>,
}

impl<T, A: Allocator> BlockPartitionedVec<T, A> {
    pub(crate) fn new_in(counts: impl ExactSizeIterator<Item = u32>, value: T, alloc: A) -> Self
    where
        T: Clone,
        A: Clone,
    {
        let (offsets, length) = Self::build_offsets(counts, alloc.clone());
        let data = alloc::vec::from_elem_in(value, length, alloc);

        Self { offsets, data }
    }

    #[expect(unsafe_code)]
    fn build_offsets(
        mut iter: impl ExactSizeIterator<Item = u32>,
        alloc: A,
    ) -> (Box<BasicBlockSlice<u32>, A>, usize) {
        let mut offsets = Box::new_uninit_slice_in(iter.len() + 1, alloc);

        let mut offset = 0_u32;

        offsets[0].write(0);

        let (_, rest) = offsets[1..].write_iter(iter::from_fn(|| {
            let next = iter.next()?;

            offset += next;

            Some(offset)
        }));

        debug_assert!(rest.is_empty());
        debug_assert_eq!(iter.len(), 0);

        // SAFETY: We have initialized all elements of the slice.
        let offsets = unsafe { offsets.assume_init() };
        let offsets = BasicBlockSlice::from_boxed_slice(offsets);

        (offsets, offset as usize)
    }

    #[inline]
    fn range(&self, block: BasicBlockId) -> core::ops::Range<usize> {
        (self.offsets[block] as usize)..(self.offsets[block.plus(1)] as usize)
    }

    /// Returns the slice of values for `block`.
    #[inline]
    pub(crate) fn of(&self, block: BasicBlockId) -> &[T] {
        let range = self.range(block);
        &self.data[range]
    }

    /// Returns a mutable slice of values for `block`.
    #[inline]
    pub(crate) fn of_mut(&mut self, block: BasicBlockId) -> &mut [T] {
        let range = self.range(block);
        &mut self.data[range]
    }

    /// Returns an iterator over all values in the flat data array.
    #[cfg(test)]
    pub(crate) fn iter(&self) -> impl Iterator<Item = &T> {
        self.data.iter()
    }

    /// Returns the total number of elements across all blocks.
    pub(crate) const fn len(&self) -> usize {
        self.data.len()
    }

    /// Returns the number of blocks in the partition.
    #[cfg(test)]
    pub(crate) fn block_count(&self) -> usize {
        self.offsets.len() - 1
    }

    /// Rebuilds the offset table for a new partitioning.
    ///
    /// Call after transforms that change element counts per block. Does not resize or clear
    /// the data array; callers must ensure the total element count remains unchanged.
    pub(crate) fn remap(&mut self, counts: impl ExactSizeIterator<Item = u32>)
    where
        A: Clone,
    {
        let alloc = Box::allocator(&self.offsets).clone();

        let (offsets, _) = Self::build_offsets(counts, alloc);
        self.offsets = offsets;
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::cast_possible_truncation)]
    use alloc::alloc::Global;

    use super::BlockPartitionedVec;
    use crate::body::basic_block::BasicBlockId;

    /// Single block with 5 elements: all accessible via `of()`/`of_mut()`.
    #[test]
    fn single_block() {
        let mut vec = BlockPartitionedVec::new_in([5].into_iter(), 0_u32, Global);

        assert_eq!(vec.len(), 5);
        assert_eq!(vec.block_count(), 1);

        let slice = vec.of_mut(BasicBlockId::new(0));
        for (index, value) in slice.iter_mut().enumerate() {
            *value = index as u32;
        }

        let slice = vec.of(BasicBlockId::new(0));
        assert_eq!(slice, &[0, 1, 2, 3, 4]);
    }

    /// Multiple blocks with varying sizes: elements are correctly partitioned.
    #[test]
    fn multiple_blocks() {
        let mut vec = BlockPartitionedVec::new_in([2, 3, 1].into_iter(), 0_u32, Global);

        assert_eq!(vec.len(), 6);
        assert_eq!(vec.block_count(), 3);

        vec.of_mut(BasicBlockId::new(0))[0] = 10;
        vec.of_mut(BasicBlockId::new(0))[1] = 20;
        vec.of_mut(BasicBlockId::new(1))[0] = 30;
        vec.of_mut(BasicBlockId::new(1))[1] = 40;
        vec.of_mut(BasicBlockId::new(1))[2] = 50;
        vec.of_mut(BasicBlockId::new(2))[0] = 60;

        assert_eq!(vec.of(BasicBlockId::new(0)), &[10, 20]);
        assert_eq!(vec.of(BasicBlockId::new(1)), &[30, 40, 50]);
        assert_eq!(vec.of(BasicBlockId::new(2)), &[60]);
    }

    /// Blocks with zero elements produce empty slices.
    #[test]
    fn empty_blocks() {
        let vec = BlockPartitionedVec::new_in([0, 3, 0].into_iter(), 0_u32, Global);

        assert_eq!(vec.len(), 3);
        assert_eq!(vec.block_count(), 3);
        assert!(vec.of(BasicBlockId::new(0)).is_empty());
        assert_eq!(vec.of(BasicBlockId::new(1)).len(), 3);
        assert!(vec.of(BasicBlockId::new(2)).is_empty());
    }

    /// Zero blocks is valid.
    #[test]
    fn no_blocks() {
        let vec = BlockPartitionedVec::new_in(core::iter::empty::<u32>(), 0_u32, Global);

        assert_eq!(vec.len(), 0);
        assert_eq!(vec.block_count(), 0);
    }

    /// `iter()` yields all elements in flat order.
    #[test]
    fn iter_all_elements() {
        let mut vec = BlockPartitionedVec::new_in([2, 1].into_iter(), 0_u32, Global);

        vec.of_mut(BasicBlockId::new(0))[0] = 1;
        vec.of_mut(BasicBlockId::new(0))[1] = 2;
        vec.of_mut(BasicBlockId::new(1))[0] = 3;

        let collected: Vec<u32> = vec.iter().copied().collect();
        assert_eq!(collected, vec![1, 2, 3]);
    }

    /// `remap()` rebuilds the offset table without changing data.
    #[test]
    fn remap_preserves_data() {
        let mut vec = BlockPartitionedVec::new_in([3, 3].into_iter(), 0_u32, Global);

        // Write sequential values
        for (index, value) in vec.of_mut(BasicBlockId::new(0)).iter_mut().enumerate() {
            *value = index as u32;
        }
        for (index, value) in vec.of_mut(BasicBlockId::new(1)).iter_mut().enumerate() {
            *value = (index + 3) as u32;
        }

        // Remap to a different partitioning with the same total count
        vec.remap([2, 4].into_iter());

        assert_eq!(vec.block_count(), 2);
        assert_eq!(vec.of(BasicBlockId::new(0)), &[0, 1]);
        assert_eq!(vec.of(BasicBlockId::new(1)), &[2, 3, 4, 5]);
    }
}
