use super::prelude::*;

use flatbuffers_arrow::FlatBufferBuilder;

use std::sync::Arc;

pub const CONTINUATION: usize = 8;

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

impl<'fbb> FlatBufferWrapper<'fbb> {
    pub fn len(&self) -> usize {
        self.finished_builder.finished_data().len()
    }
}

impl<'fbb> From<FlatBufferBuilder<'fbb>> for FlatBufferWrapper<'fbb> {
    fn from(finished_builder: FlatBufferBuilder<'fbb>) -> Self {
        FlatBufferWrapper { finished_builder }
    }
}

impl<'fbb> AsRef<[u8]> for FlatBufferWrapper<'fbb> {
    fn as_ref(&self) -> &[u8] {
        self.finished_builder.finished_data()
    }
}

pub fn bool_to_arrow(data: &Vec<bool>) -> Arc<array::ArrayData> {
    let num_byte = arrow_bit_util::ceil(data.len(), 8);
    let mut mut_buf = ArrowMutableBuffer::new(num_byte).with_bitset(num_byte, false);
    {
        let mut_slice = mut_buf.data_mut();
        for (i, b) in data.iter().enumerate() {
            if *b {
                arrow_bit_util::set_bit(mut_slice, i);
            }
        }
    }
    let array_data = array::ArrayData::builder(ArrowDataType::Boolean)
        .len(data.len())
        .add_buffer(mut_buf.freeze())
        .build();
    array_data
}

pub fn opt_bool_to_arrow(data: &Vec<Option<bool>>) -> Arc<array::ArrayData> {
    let num_byte = arrow_bit_util::ceil(data.len(), 8);
    let mut nulls = ArrowMutableBuffer::new(num_byte).with_bitset(num_byte, false);
    let mut mut_buf = ArrowMutableBuffer::new(num_byte).with_bitset(num_byte, false);
    let mut null_count = 0;
    {
        let mut_slice = mut_buf.data_mut();
        let mut_nulls = nulls.data_mut();
        for (i, b) in data.iter().enumerate() {
            if let Some(b) = b {
                arrow_bit_util::set_bit(mut_nulls, i);
                if *b {
                    arrow_bit_util::set_bit(mut_slice, i);
                }
            } else {
                null_count += 1;
            }
        }
    }
    let array_data = array::ArrayData::builder(ArrowDataType::Boolean)
        .len(data.len())
        .add_buffer(mut_buf.freeze())
        .null_bit_buffer(nulls.freeze())
        .null_count(null_count)
        .build();
    array_data
}

pub fn get_bit(buffer: &[u8], i: usize) -> bool {
    arrow_bit_util::get_bit(buffer, i)
}

pub trait DataSliceUtils<'a> {
    fn from_offset(&'a mut self, buffer: &crate::datastore::meta::Buffer) -> &'a mut [u8];
    fn fill_with_ones(&mut self);
    fn write_i32_offsets_from_iter(&mut self, iter: impl Iterator<Item = usize>);
}

impl<'a> DataSliceUtils<'a> for &mut [u8] {
    fn from_offset(&'a mut self, buffer: &crate::datastore::meta::Buffer) -> &'a mut [u8] {
        &mut self[buffer.offset..buffer.offset + buffer.length]
    }

    /// If this is a null buffer, all elements will be valid
    fn fill_with_ones(&mut self) {
        self.iter_mut().for_each(|v| *v = 255);
    }

    /// If this is an offset buffer, write n + 1 offsets as i32 (Arrow format)
    fn write_i32_offsets_from_iter(&mut self, iter: impl Iterator<Item = usize>) {
        let offsets = unsafe {
            let aligned = self.align_to_mut::<i32>();
            debug_assert_eq!(aligned.0.len(), 0);
            aligned.1
        };
        offsets[0] = 0;
        let mut next_offset = 0;
        iter.enumerate().for_each(|(i, n)| {
            next_offset += n as i32;
            offsets[i + 1] = next_offset;
        })
    }
}
