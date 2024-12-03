use frunk::HCons;
use harpc_types::{
    procedure::{ProcedureDescriptor, ProcedureId},
    version::Version,
};

use crate::{Subsystem, metadata::Deprecation};

/// A marker trait for procedures that are included in a service.
///
/// This marker trait allows us to ensure that a service only includes procedures that are part of
/// it.
#[marker]
pub trait IncludesProcedure<P> {}

impl<Head, Tail> IncludesProcedure<Head> for HCons<Head, Tail> where Head: Procedure {}
impl<Head, Tail, P> IncludesProcedure<P> for HCons<Head, Tail> where Tail: IncludesProcedure<P> {}

pub trait ProcedureIdentifier: Sized {
    type Subsystem: Subsystem;

    fn from_id(id: ProcedureId) -> Option<Self>;
    fn into_id(self) -> ProcedureId;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ProcedureInformation {
    pub descriptor: ProcedureDescriptor,

    /// The version at which the procedure was introduced.
    pub since: Version,

    /// The deprecation information for the procedure.
    pub deprecation: Option<Deprecation>,
}

pub trait Procedure: Sized {
    type Subsystem: Subsystem<Procedures: IncludesProcedure<Self>>;

    const ID: <Self::Subsystem as Subsystem>::ProcedureId;

    /// Returns the descriptor for this procedure.
    #[must_use]
    fn descriptor() -> ProcedureDescriptor {
        ProcedureDescriptor {
            id: Self::ID.into_id(),
        }
    }

    /// Returns the version at which this procedure was introduced.
    ///
    /// By default, this returns the initial version of the subsystem.
    /// Override this method to specify a different introduction version.
    #[must_use]
    fn since() -> Version {
        Self::Subsystem::initial_version()
    }

    /// Returns the deprecation information for this procedure.
    ///
    /// By default, this returns `None`, indicating that the procedure is not deprecated.
    /// Override this method to specify deprecation information.
    #[must_use]
    fn deprecation() -> Option<Deprecation> {
        None
    }

    /// Returns comprehensive information about the procedure.
    ///
    /// This method aggregates the descriptor, introduction version, and deprecation status
    /// of the procedure into a single `ProcedureInformation` struct.
    #[must_use]
    fn information() -> ProcedureInformation {
        ProcedureInformation {
            descriptor: Self::descriptor(),
            since: Self::since(),
            deprecation: Self::deprecation(),
        }
    }
}
