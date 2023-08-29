mod spicedb;

use core::fmt;
use std::error::Error;

use error_stack::Report;

pub use self::spicedb::{SpiceDb, SpiceDbConfig};
use crate::zanzibar::{Affiliation, Consistency, Relation, Resource, StringTuple, Subject, Zookie};

/// A backend for interacting with an authorization system based on the Zanzibar model.
pub trait AuthorizationBackend {
    /// Creates a new relation between a [`Subject`] and an [`Resource`] with the specified
    /// [`Affiliation`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation already exists or could not be created.
    async fn create_relation<R, A, S>(
        &self,
        resource: &R,
        affiliation: &A,
        subject: &S,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        R: Resource + ?Sized + Sync,
        A: Relation<R> + ?Sized + Sync,
        S: Subject + ?Sized + Sync;

    /// Returns if the [`Subject`] has the specified permission or relation to an [`Resource`].
    ///
    /// # Errors
    ///
    /// Returns an error if the check could not be performed.
    ///
    /// Note, that this will not fail if the [`Subject`] does not have the specified permission or
    /// relation to the [`Resource`]. Instead, the [`CheckResponse::has_permission`] field will be
    /// set to `false`.
    async fn check<R, P, S>(
        &self,
        resource: &R,
        permission: &P,
        subject: &S,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        R: Resource + ?Sized + Sync,
        P: Affiliation<R> + ?Sized + Sync,
        S: Subject + ?Sized + Sync;
}

/// Return value for [`AuthorizationBackend::check`].
#[derive(Debug)]
pub struct CheckResponse {
    /// If the [`Subject`] has the specified permission or relation to an [`Resource`].
    pub has_permission: bool,
    /// A token to determine the time at which the check was performed.
    pub checked_at: Zookie<'static>,
}

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

/// Return value for [`AuthorizationBackend::create_relation`].
#[derive(Debug)]
pub struct CreateRelationResponse {
    /// A token to determine the time at which the relation was created.
    pub written_at: Zookie<'static>,
}

#[derive(Debug)]
pub struct CreateRelationError {
    pub tuple: StringTuple,
}

impl fmt::Display for CreateRelationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "failed to create relation: `{}`", self.tuple)
    }
}

impl Error for CreateRelationError {}
