mod spicedb;

use core::fmt;
use std::error::Error;

use error_stack::Report;

pub use self::spicedb::{RelationshipFilter, SpiceDb, SpiceDbConfig};
use crate::zanzibar::{
    Affiliation, Consistency, GenericAffiliation, GenericResource, GenericSubject, Resource,
    Subject, Tuple, Zookie,
};

/// A backend for interacting with an authorization system based on the Zanzibar model.
pub trait AuthorizationBackend {
    /// Returns if the [`Subject`] has the specified permission or relation to an [`Resource`].
    async fn check<S, A, R>(
        &self,
        subject: &S,
        affiliation: &A,
        resource: &R,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        S: Subject + Sync,
        A: Affiliation<R> + Sync,
        R: Resource + Sync;
}

/// Return value for [`AuthorizationBackend::check`].
#[derive(Debug)]
pub struct CheckResponse {
    /// If the [`Subject`] has the specified permission or relation to an [`Resource`].
    pub has_permission: bool,
    /// A token to determine the time at which the check was performed.
    pub checked_at: Zookie<'static>,
}

type StringTuple = Tuple<
    GenericResource<String, String>,
    GenericAffiliation<String>,
    GenericSubject<GenericResource<String, String>, GenericAffiliation<String>>,
>;

#[derive(Debug)]
pub struct CheckError {
    pub tuple: StringTuple,
}

impl fmt::Display for CheckError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "failed to check permission: `{}`", self.tuple)
    }
}

impl Error for CheckError {}
