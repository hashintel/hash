use harpc_types::{service::ServiceId, version::Version};

use crate::{metadata::Metadata, procedure::ProcedureIdentifier};

pub trait Service {
    type ProcedureId: ProcedureIdentifier;
    /// Heteregenous list of procedures that are part of this service, used for type-level
    /// validation.
    type Procedures;

    const ID: ServiceId;
    const VERSION: Version;

    fn metadata() -> Metadata;
}
