use hashql_core::id::{Id, IdVec};

use super::{
    super::codec::{RowCodec, Universe},
    OpenOptions,
};
use crate::serve2::codec::{EncodableId, EncodedRowId};

#[derive(Debug)]
pub(crate) struct Encoding<I> {
    codec: RowCodec<I>,
    lookup: IdVec<I, EncodedRowId<I>>,
}

impl<I> Encoding<I> {
    pub(crate) fn open(
        OpenOptions { generation, secret }: OpenOptions<'_>,
        universe: Universe<I>,
    ) -> Self
    where
        I: EncodableId,
    {
        let codec = RowCodec::derive(secret.as_ref(), generation.id());
        let lookup = IdVec::from_fn(universe.size(), |id| codec.encode(id));

        Self { codec, lookup }
    }

    pub(super) fn encode(&self, row: I) -> EncodedRowId<I>
    where
        I: EncodableId,
    {
        if let Some(&encoded) = self.lookup.get(row) {
            return encoded;
        }

        self.codec.encode(row)
    }

    pub(super) fn decode(&self, wire: EncodedRowId<I>, universe: Universe<I>) -> Option<I>
    where
        I: Id,
    {
        self.codec.decode(wire, universe)
    }
}
