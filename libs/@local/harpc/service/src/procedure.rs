use frunk::HCons;
use harpc_types::procedure::ProcedureId;

use crate::{metadata::Metadata, service::Service};

/// A marker trait for procedures that are included in a service.
///
/// This marker trait allows us to ensure that a service only includes procedures that are part of
/// it.
#[marker]
pub trait IncludesProcedure<P> {}

impl<Head, Tail> IncludesProcedure<Head> for HCons<Head, Tail> where Head: Procedure {}
impl<Head, Tail, P> IncludesProcedure<P> for HCons<Head, Tail> where Tail: IncludesProcedure<P> {}

pub trait ProcedureIdentifier: Sized {
    fn from_id(id: ProcedureId) -> Option<Self>;
    fn into_id(self) -> ProcedureId;
}

pub trait Procedure: Sized {
    type Service: Service<Procedures: IncludesProcedure<Self>>;

    const ID: <Self::Service as Service>::ProcedureId;

    fn metadata() -> Metadata;
}
