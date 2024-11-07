#![feature(never_type, marker_trait_attr)]

use harpc_types::{
    subsystem::{SubsystemDescriptor, SubsystemId},
    version::Version,
};

use self::{metadata::Metadata, procedure::ProcedureIdentifier};

pub mod delegate;
pub mod metadata;
pub mod procedure;
pub mod role;

pub trait SubsystemIdentifier {}

pub trait Subsystem {
    type ProcedureId: ProcedureIdentifier<Subsystem = Self>;
    /// Heterogeneous list of procedures that are part of this service, used for type-level
    /// validation.
    type Procedures;

    const ID: SubsystemId;
    const VERSION: Version;

    #[must_use]
    fn descriptor() -> SubsystemDescriptor {
        SubsystemDescriptor {
            id: Self::ID,
            version: Self::VERSION,
        }
    }

    fn metadata() -> Metadata;
}
