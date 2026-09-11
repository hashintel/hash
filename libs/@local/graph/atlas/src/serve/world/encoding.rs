use hashql_core::id::{Id, IdVec};

use super::{
    super::codec::{RowCodec, RowDomain},
    OpenOptions,
};
use crate::serve::codec::{EncodableId, EncodedRowId};

/// One row domain's codec with the wire ids of the opening domain precomputed.
#[derive(Debug)]
pub(crate) struct Encoding<I> {
    codec: RowCodec<I>,
    lookup: IdVec<I, EncodedRowId<I>>,
}

impl<I> Encoding<I> {
    /// Derives the codec and precomputes the wire id of every row in `domain`.
    ///
    /// # Complexity
    ///
    /// After codec derivation, precomputation takes O(n) time and retains n wire-ID entries for
    /// n rows in `domain`. Each row requires eight keyed Feistel rounds through
    /// [`RowCodec::encode`].
    ///
    /// # Panics
    ///
    /// Panics if `domain` contains a row the codec cannot encode, at or beyond
    /// [`WIRE_ROW_BOUND`](crate::serve::codec::WIRE_ROW_BOUND).
    pub(crate) fn open(
        OpenOptions { generation, secret }: OpenOptions<'_>,
        domain: RowDomain<I>,
    ) -> Self
    where
        I: EncodableId,
    {
        let codec = RowCodec::derive(secret.as_ref(), generation.id());
        let lookup = IdVec::from_fn(domain.size(), |id| codec.encode(id));

        Self { codec, lookup }
    }

    /// Encodes `row` as its wire id.
    ///
    /// # Complexity
    ///
    /// Rows in the opening domain use a table lookup. Later rows require eight keyed Feistel
    /// rounds through [`RowCodec::encode`]. Both paths take O(1) time in the opening row count
    /// and use constant additional space.
    ///
    /// # Panics
    ///
    /// Panics if `row` lies at or beyond
    /// [`WIRE_ROW_BOUND`](crate::serve::codec::WIRE_ROW_BOUND), as [`RowCodec::encode`] does.
    pub(super) fn encode(&self, row: I) -> EncodedRowId<I>
    where
        I: EncodableId,
    {
        if let Some(&encoded) = self.lookup.get(row) {
            return encoded;
        }

        self.codec.encode(row)
    }

    /// Decodes a wire value to a row accepted by `domain`.
    ///
    /// Returns [`None`] when the inverse permutation yields a value outside `I` or `domain`.
    ///
    /// # Complexity
    ///
    /// Every decode applies eight inverse Feistel rounds through [`RowCodec::decode`], taking
    /// O(1) time in the opening row count and constant additional space.
    pub(super) fn decode(&self, wire: EncodedRowId<I>, domain: RowDomain<I>) -> Option<I>
    where
        I: Id,
    {
        self.codec.decode(wire, domain)
    }
}
