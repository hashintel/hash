use error_stack::Report;
use hashql_core::id::IdVec;

use super::{
    super::codec::{RowCodec, Universe},
    error::WorldError,
};
use crate::{file::generation::Generation, identity::BasePosition, serve::WireRow};

pub struct Encoding<I> {
    codec: RowCodec<I>,
    lookup: IdVec<BasePosition, WireRow<I>>,
    universe: Universe<I>,
}

impl<I> Encoding<I> {
    pub(crate) fn open(generation: &Generation) -> Result<Self, Report<[WorldError]>> {
        todo!()
    }
}
