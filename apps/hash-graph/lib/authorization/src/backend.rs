mod spicedb;

use core::fmt;
use std::error::Error;

use error_stack::Report;

pub use self::spicedb::SpiceDbOpenApi;
use crate::zanzibar::{Consistency, Tuple, UntypedTuple, Zookie};

/// A backend for interacting with an authorization system based on the Zanzibar model.
pub trait ZanzibarBackend {
    /// Loads a schema into the backend.
    ///
    /// Please see the documentation on the corresponding backend for more information.
    ///
    /// # Errors
    ///
    /// Returns an error if the schema could not be loaded
    async fn import_schema(
        &mut self,
        schema: &str,
    ) -> Result<ImportSchemaResponse, Report<ImportSchemaError>>;

    /// Reads a schema from the backend.
    ///
    /// Please see the documentation on the corresponding backend for more information.
    ///
    /// # Errors
    ///
    /// Returns an error if the schema could not be read
    async fn export_schema(&self) -> Result<ExportSchemaResponse, Report<ExportSchemaError>>;

    /// Creates a new relation specified by the [`Tuple`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation already exists or could not be created.
    async fn create_relations<'t, T>(
        &mut self,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Tuple + Sync + 't;

    /// Deletes the relation specified by the [`Tuple`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation does not exist or could not be deleted.
    async fn delete_relations<'t, T>(
        &mut self,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        T: Tuple + Sync + 't;

    /// Returns if the subject of the [`Tuple`] has the specified permission or relation to an
    /// [`Resource`].
    ///
    /// # Errors
    ///
    /// Returns an error if the check could not be performed.
    ///
    /// Note, that this will not fail if the subject does not have the specified permission or
    /// relation to the [`Resource`]. Instead, the [`CheckResponse::has_permission`] field will be
    /// set to `false`.
    ///
    /// [`Resource`]: crate::zanzibar::Resource
    async fn check<T>(
        &self,
        tuple: &T,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        T: Tuple + Sync;
}

/// Return value for [`ZanzibarBackend::import_schema`].
#[derive(Debug)]
pub struct ImportSchemaResponse {
    /// A token to determine the time at which the schema was written.
    pub written_at: Zookie<'static>,
}

/// Error returned from [`ZanzibarBackend::import_schema`].
#[derive(Debug)]
pub struct ImportSchemaError;

impl fmt::Display for ImportSchemaError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to import schema")
    }
}

impl Error for ImportSchemaError {}

/// Return value for [`ZanzibarBackend::export_schema`].
#[derive(Debug)]
pub struct ExportSchemaResponse {
    /// The schema text.
    pub schema: String,
    /// A token to determine the time at which the schema was read.
    pub read_at: Zookie<'static>,
}

/// Error returned from [`ZanzibarBackend::export_schema`].
#[derive(Debug)]
pub struct ExportSchemaError;

impl fmt::Display for ExportSchemaError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to export schema")
    }
}

impl Error for ExportSchemaError {}

/// Return value for [`ZanzibarBackend::create_relations`].
#[derive(Debug)]
pub struct CreateRelationResponse {
    /// A token to determine the time at which the relation was created.
    pub written_at: Zookie<'static>,
}

/// Error returned from [`ZanzibarBackend::create_relations`].
#[derive(Debug)]
pub struct CreateRelationError;

impl fmt::Display for CreateRelationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to create relations")
    }
}

impl Error for CreateRelationError {}

/// Return value for [`ZanzibarBackend::delete_relations`].
#[derive(Debug)]
pub struct DeleteRelationResponse {
    /// A token to determine the time at which the relation was deleted.
    pub deleted_at: Zookie<'static>,
}

/// Error returned from [`ZanzibarBackend::delete_relations`].
#[derive(Debug)]
pub struct DeleteRelationError;

impl fmt::Display for DeleteRelationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to delete relation")
    }
}

impl Error for DeleteRelationError {}

/// Return value for [`ZanzibarBackend::check`].
#[derive(Debug)]
#[must_use]
pub struct CheckResponse {
    /// If the subject has the specified permission or relation to an [`Resource`].
    ///
    /// [`Resource`]: crate::zanzibar::Resource
    pub has_permission: bool,
    /// A token to determine the time at which the check was performed.
    pub checked_at: Zookie<'static>,
}

impl CheckResponse {
    /// Asserts that the subject has the specified permission or relation to an [`Resource`].
    ///
    /// # Errors
    ///
    /// Returns an error if the subject does not have the specified permission or relation to the
    /// [`Resource`].
    ///
    /// [`Resource`]: crate::zanzibar::Resource
    pub fn assert_permission(self) -> Result<Zookie<'static>, PermissionAssertion> {
        if self.has_permission {
            Ok(self.checked_at)
        } else {
            Err(PermissionAssertion)
        }
    }
}

/// Error returned from [`ZanzibarBackend::check`].
#[derive(Debug)]
pub struct CheckError {
    pub tuple: UntypedTuple<'static>,
}

impl fmt::Display for CheckError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "failed to check permission: `{}`", self.tuple)
    }
}

impl Error for CheckError {}

#[derive(Debug)]
pub struct ModifyRelationError;

impl fmt::Display for ModifyRelationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to modify relation")
    }
}

impl Error for ModifyRelationError {}

#[derive(Debug)]
pub struct PermissionAssertion;

impl fmt::Display for PermissionAssertion {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("Permission denied")
    }
}

impl Error for PermissionAssertion {}
