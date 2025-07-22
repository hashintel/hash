//! # HaRPC System
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    marker_trait_attr,
    never_type,
)]

use harpc_types::{
    subsystem::{SubsystemDescriptor, SubsystemId},
    version::Version,
};

use self::{metadata::Deprecation, procedure::ProcedureIdentifier};

pub mod delegate;
pub mod metadata;
pub mod procedure;

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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct SubsystemInformation {
    pub descriptor: SubsystemDescriptor,
    /// The deprecation information for subsystem.
    pub deprecation: Option<Deprecation>,
    /// The initial version this subsystem was introduced in.
    pub initial_version: Version,
}

pub trait Subsystem {
    type SubsystemId: SubsystemIdentifier;
    type ProcedureId: ProcedureIdentifier<Subsystem = Self>;
    /// Heterogeneous list of procedures that are part of this service, used for type-level
    /// validation.
    type Procedures;

    const ID: Self::SubsystemId;
    const VERSION: Version;

    /// Returns the descriptor for this subsystem.
    #[must_use]
    fn descriptor() -> SubsystemDescriptor {
        SubsystemDescriptor {
            id: Self::ID.into_id(),
            version: Self::VERSION,
        }
    }

    /// Returns the initial version in which this subsystem was introduced.
    ///
    /// This version represents the first release where the subsystem became available.
    ///
    /// By default, this returns the initial version of `0.0`.
    #[must_use]
    fn initial_version() -> Version {
        Version {
            major: 0x00,
            minor: 0x00,
        }
    }

    /// Returns the deprecation information for this subsystem, if any.
    ///
    /// By default, this returns `None`, indicating that the procedure is not deprecated.
    /// Override this method to specify deprecation information.
    #[must_use]
    fn deprecation() -> Option<Deprecation> {
        None
    }

    /// Returns comprehensive information about the subsystem.
    ///
    /// This method aggregates various details about the subsystem, including its
    /// descriptor, initial version, and deprecation status.
    #[must_use]
    fn information() -> SubsystemInformation {
        SubsystemInformation {
            descriptor: Self::descriptor(),
            initial_version: Self::initial_version(),
            deprecation: Self::deprecation(),
        }
    }
}
