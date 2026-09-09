use alloc::alloc::Allocator;

use hashql_core::id::{Id, IdSlice, bit_vec::BitMatrix};
use zerocopy::IntoBytes as _;

use crate::{math::Vec2, postgres::id::ArchivedEntityId, serve2::codec::EncodedRowId};

/// Little-endian columns in delivered-slot order.
pub(crate) struct ColumnWriter<'bytes, A: Allocator> {
    bytes: &'bytes mut Vec<u8, A>,
}

#[expect(
    clippy::little_endian_bytes,
    reason = "document columns use little-endian values"
)]
impl<'bytes, A: Allocator> ColumnWriter<'bytes, A> {
    pub(crate) const fn over(bytes: &'bytes mut Vec<u8, A>) -> Self {
        Self { bytes }
    }

    pub(crate) fn rows<I: Id, R>(&mut self, values: &IdSlice<I, EncodedRowId<R>>) {
        self.bytes.reserve(size_of_val(values.as_raw()));
        for &value in values {
            self.bytes.extend_from_slice(&value.get().to_le_bytes());
        }
    }

    pub(crate) fn positions<I: Id>(&mut self, values: &IdSlice<I, Vec2>) {
        self.bytes.reserve(size_of_val(values.as_raw()));
        for value in values {
            self.bytes.extend_from_slice(&value.x().to_le_bytes());
            self.bytes.extend_from_slice(&value.y().to_le_bytes());
        }
    }

    pub(crate) fn identities<I: Id>(&mut self, values: &IdSlice<I, ArchivedEntityId>) {
        self.bytes.extend_from_slice(values.as_raw().as_bytes());
    }

    /// Emits each row in ceil(columns / 8) bytes, least-significant bit first.
    pub(crate) fn masks<R: Id, C: Id>(&mut self, values: &BitMatrix<R, C>) {
        let stride = values.col_domain_size().div_ceil(8);
        self.bytes.reserve(values.row_domain_size() * stride);
        for row in values.rows() {
            self.bytes.extend(
                values
                    .row(row)
                    .words()
                    .iter()
                    .flat_map(|word| word.to_le_bytes())
                    .take(stride),
            );
        }
    }
}
