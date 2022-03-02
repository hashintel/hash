use flatbuffers::FlatBufferBuilder;

use super::prelude::*;

pub const CONTINUATION: usize = 8;

// TODO: UNUSED: Needs triage
#[must_use]
pub fn buffer_mut_without_continuation(buf: &mut [u8]) -> &mut [u8] {
    &mut buf[CONTINUATION..]
}

#[must_use]
pub fn buffer_without_continuation(buf: &[u8]) -> &[u8] {
    &buf[CONTINUATION..]
}

#[must_use]
pub fn arrow_continuation(len: usize) -> Vec<u8> {
    let mut data_vec = Vec::with_capacity(CONTINUATION);
    data_vec.extend_from_slice(&[255, 255, 255, 255]);
    data_vec.extend_from_slice(&(len as u32).to_le_bytes());
    data_vec
}

pub struct FlatBufferWrapper<'fbb> {
    finished_builder: FlatBufferBuilder<'fbb>,
}

impl FlatBufferWrapper<'_> {
    pub fn len(&self) -> usize {
        self.finished_builder.finished_data().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl<'fbb> From<FlatBufferBuilder<'fbb>> for FlatBufferWrapper<'fbb> {
    fn from(finished_builder: FlatBufferBuilder<'fbb>) -> Self {
        FlatBufferWrapper { finished_builder }
    }
}

impl AsRef<[u8]> for FlatBufferWrapper<'_> {
    fn as_ref(&self) -> &[u8] {
        self.finished_builder.finished_data()
    }
}

// TODO: UNUSED: Needs triage
pub fn get_bit(buffer: &[u8], i: usize) -> bool {
    arrow_bit_util::get_bit(buffer, i)
}

pub trait DataSliceUtils<'a> {
    fn from_offset(&'a mut self, buffer: &crate::datastore::meta::Buffer) -> &'a mut [u8];
    fn fill_with_ones(&mut self);
    fn write_i32_offsets_from_iter(&mut self, iter: impl Iterator<Item = usize>);
}

impl<'a> DataSliceUtils<'a> for &mut [u8] {
    // TODO: Rename to from_buffer/buffer_slice?
    fn from_offset(&'a mut self, buffer: &crate::datastore::meta::Buffer) -> &'a mut [u8] {
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
