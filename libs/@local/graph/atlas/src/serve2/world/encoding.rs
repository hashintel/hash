use alloc::alloc::Global;

use error_stack::Report;
use hashql_core::id::{Id, IdSlice, IdVec};

use super::{
    super::codec::{RowCodec, Universe},
    OpenOptions,
    error::WorldError,
};
use crate::{
    identity::BasePosition,
    serve2::codec::{EncodableId, EncodedRowId},
};

pub struct Encoding<I> {
    codec: RowCodec<I>,
    lookup: IdVec<BasePosition, EncodedRowId<I>>,
    universe: Universe<I>,
}

impl<I> Encoding<I> {
    pub(crate) fn open(
        OpenOptions { generation, secret }: OpenOptions<'_>,
        domain: &IdSlice<BasePosition, I>,
    ) -> Result<Self, Report<[WorldError]>>
    where
        I: EncodableId,
    {
        let codec = RowCodec::derive(secret.as_ref(), generation.id());
        let lookup = IdVec::from_domain_derive_in(|_, &id| codec.encode(id), domain, Global);

        // The domain length is the same across domains, as the domain is bijective
        let universe = Universe::new(I::from_usize(domain.len()));

        Ok(Self {
            codec,
            lookup,
            universe,
        })
    }
}
