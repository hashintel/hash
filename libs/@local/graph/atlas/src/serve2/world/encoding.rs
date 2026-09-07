use alloc::alloc::Global;

use hashql_core::id::{IdSlice, IdVec};

use super::{
    super::codec::{RowCodec, Universe},
    OpenOptions,
};
use crate::{
    identity::BasePosition,
    serve2::codec::{EncodableId, EncodedRowId},
};

#[derive(Debug)]
pub struct Encoding<I> {
    codec: RowCodec<I>,
    lookup: IdVec<BasePosition, EncodedRowId<I>>,
    universe: Universe<I>,
}

impl<I> Encoding<I> {
    pub(crate) fn open(
        OpenOptions { generation, secret }: OpenOptions<'_>,
        domain: &IdSlice<BasePosition, I>,
    ) -> Self
    where
        I: EncodableId,
    {
        let codec = RowCodec::derive(secret.as_ref(), generation.id());
        let lookup = IdVec::from_domain_derive_in(|_, &id| codec.encode(id), domain, Global);

        // The domain length is the same across domains, as the domain is bijective
        let universe = Universe::new(I::from_usize(domain.len()));

        Self {
            codec,
            lookup,
            universe,
        }
    }
}
