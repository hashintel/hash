#![feature(never_type, marker_trait_attr)]

use harpc_types::{service::ServiceId, version::Version};

use self::{metadata::Metadata, procedure::ProcedureIdentifier};

pub mod delegate;
pub mod metadata;
pub mod procedure;
pub mod role;

pub trait Service {
    type ProcedureId: ProcedureIdentifier;
    /// Heteregenous list of procedures that are part of this service, used for type-level
    /// validation.
    type Procedures;

    const ID: ServiceId;
    const VERSION: Version;

    fn metadata() -> Metadata;
}
