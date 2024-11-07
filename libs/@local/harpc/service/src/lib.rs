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

pub trait SubsystemIdentifier: Copy {
    fn from_id(id: SubsystemId) -> Option<Self>
    where
        Self: Sized;

    fn into_id(self) -> SubsystemId;
}

/// Represents a specialized or refined version of a broader subsystem identifier.
///
/// Primarily used for type-level validation in the `harpc-server` crate.
pub trait RefinedSubsystemIdentifier<Id> {
    fn broaden(self) -> Id;
}

impl<Id> RefinedSubsystemIdentifier<Id> for Id
where
    Id: SubsystemIdentifier,
{
    fn broaden(self) -> Id {
        self
    }
}

impl<Id> RefinedSubsystemIdentifier<Id> for ! {
    fn broaden(self) -> Id {
        match self {}
    }
}

pub trait Subsystem {
    type SubsystemId: SubsystemIdentifier;
    type ProcedureId: ProcedureIdentifier<Subsystem = Self>;
    /// Heterogeneous list of procedures that are part of this service, used for type-level
    /// validation.
    type Procedures;

    const ID: Self::SubsystemId;
    const VERSION: Version;

    #[must_use]
    fn descriptor() -> SubsystemDescriptor {
        SubsystemDescriptor {
            id: Self::ID.into_id(),
            version: Self::VERSION,
        }
    }

    fn metadata() -> Metadata;
}
