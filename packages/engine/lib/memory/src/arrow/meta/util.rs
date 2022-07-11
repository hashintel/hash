use crate::arrow::meta;

pub trait DataSliceUtils<'a> {
    // TODO: Rename
    #[allow(clippy::wrong_self_convention)]
    fn from_offset(&'a mut self, buffer: &meta::Buffer) -> &'a mut [u8];
    fn fill_with_ones(&mut self);
    fn write_i32_offsets_from_iter(&mut self, iter: impl Iterator<Item = usize>);
}

impl<'a> DataSliceUtils<'a> for &mut [u8] {
    // TODO: Rename to from_buffer/buffer_slice?
    fn from_offset(&'a mut self, buffer: &meta::Buffer) -> &'a mut [u8] {
        &mut self[buffer.offset..buffer.offset + buffer.length]
    }

    /// If this is a null buffer, all elements will be valid
    fn fill_with_ones(&mut self) {
        self.iter_mut().for_each(|v| *v = 255);
    }

    /// If this is an offset buffer, write n + 1 offsets as i32 (Arrow format)
    /// `lens` gives the length of each element in the Arrow array, i.e. the
    /// difference between consecutive offsets.
    fn write_i32_offsets_from_iter(&mut self, lens: impl Iterator<Item = usize>) {
        let offsets = unsafe {
            let aligned = self.align_to_mut::<i32>();
            // In fact, Arrow offsets are always aligned, so the prefix `aligned.0` is empty.
            debug_assert_eq!(aligned.0.len(), 0);
            aligned.1
        };
        offsets[0] = 0;
        let mut next_offset = 0;
        lens.enumerate().for_each(|(i, len)| {
            next_offset += len as i32;
            offsets[i + 1] = next_offset; // `n+1` offsets
        })
    }
}
