mod spicedb;

use core::fmt;
use std::{error::Error, future::Future};

use error_stack::Report;
use serde::{Deserialize, Serialize};

pub use self::spicedb::SpiceDbOpenApi;
use crate::{
    zanzibar::{
        types::{Object, Relationship, RelationshipFilter, Subject},
        Affiliation, Consistency, Zookie,
    },
    NoAuthorization,
};

/// A backend for interacting with an authorization system based on the Zanzibar model.
pub trait ZanzibarBackend {
    /// Loads a schema into the backend.
    ///
    /// Please see the documentation on the corresponding backend for more information.
    ///
    /// # Errors
    ///
    /// Returns an error if the schema could not be loaded
    fn import_schema(
        &mut self,
        schema: &str,
    ) -> impl Future<Output = Result<ImportSchemaResponse, Report<ImportSchemaError>>> + Send;

    /// Reads a schema from the backend.
    ///
    /// Please see the documentation on the corresponding backend for more information.
    ///
    /// # Errors
    ///
    /// Returns an error if the schema could not be read
    fn export_schema(
        &self,
    ) -> impl Future<Output = Result<ExportSchemaResponse, Report<ExportSchemaError>>> + Send;

    /// Creates a new relation specified by the [`Relationship`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation already exists or could not be created.
    fn create_relations<R>(
        &mut self,
        tuples: impl IntoIterator<Item = R, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<CreateRelationResponse, Report<CreateRelationError>>> + Send
    where
        R: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Object<Namespace: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync;

    /// Creates a new relation specified by the [`Relationship`] but does not error if it already
    /// exists.
    ///
    /// # Errors
    ///
    /// Returns an error if the relation could not be created.
    fn touch_relations<R>(
        &mut self,
        tuples: impl IntoIterator<Item = R, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<CreateRelationResponse, Report<CreateRelationError>>> + Send
    where
        R: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Object<Namespace: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync;

    /// Deletes the relation specified by the [`Relationship`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation does not exist or could not be deleted.
    fn delete_relations<R>(
        &mut self,
        tuples: impl IntoIterator<Item = R, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<DeleteRelationResponse, Report<DeleteRelationError>>> + Send
    where
        R: Relationship<
                Object: Object<Namespace: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Object<Namespace: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync;

    /// Returns if the [`Subject`] of the [`Relationship`] has the specified permission or relation
    /// to an [`Object`].
    ///
    /// # Errors
    ///
    /// Returns an error if the check could not be performed.
    ///
    /// Note, that this will not fail if the [`Subject`] does not have the specified permission or
    /// relation to the [`Subject`]. Instead, the [`CheckResponse::has_permission`] field will be
    /// set to `false`.
    fn check<O, R, S>(
        &self,
        resource: &O,
        permission: &R,
        subject: &S,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, Report<CheckError>>> + Send
    where
        O: Object<Namespace: Serialize, Id: Serialize> + Sync,
        R: Serialize + Affiliation<O> + Sync,
        S: Subject<Object: Object<Namespace: Serialize, Id: Serialize>, Relation: Serialize> + Sync;

    /// Returns the list of all relations matching the filter.
    ///
    /// # Errors
    ///
    /// Returns an error if the reading could not be performed.
    fn read_relations<R>(
        &self,
        filter: RelationshipFilter<
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
        >,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<Vec<R>, Report<ReadError>>> + Send
    where
        for<'de> R: Relationship<
                Object: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Deserialize<'de>,
                Subject: Object<Namespace: Deserialize<'de>, Id: Deserialize<'de>>,
                SubjectSet: Deserialize<'de>,
            > + Send;
}

impl ZanzibarBackend for NoAuthorization {
    async fn import_schema(
        &mut self,
        _schema: &str,
    ) -> Result<ImportSchemaResponse, Report<ImportSchemaError>> {
        unimplemented!()
    }

    async fn export_schema(&self) -> Result<ExportSchemaResponse, Report<ExportSchemaError>> {
        unimplemented!()
    }

    async fn create_relations<T>(
        &mut self,
        _tuples: impl IntoIterator<Item = T, IntoIter: Send> + Send,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Sync,
    {
        Ok(CreateRelationResponse {
            written_at: Zookie::empty(),
        })
    }

    async fn touch_relations<T>(
        &mut self,
        _tuples: impl IntoIterator<Item = T, IntoIter: Send> + Send,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Sync,
    {
        Ok(CreateRelationResponse {
            written_at: Zookie::empty(),
        })
    }

    async fn delete_relations<T>(
        &mut self,
        _tuples: impl IntoIterator<Item = T, IntoIter: Send> + Send,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        T: Sync,
    {
        Ok(DeleteRelationResponse {
            deleted_at: Zookie::empty(),
        })
    }

    async fn check<O, R, S>(
        &self,
        _resource: &O,
        _permission: &R,
        _subject: &S,
        _consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        O: Sync,
        R: Sync,
        S: Sync,
    {
        Ok(CheckResponse {
            checked_at: Zookie::empty(),
            has_permission: true,
        })
    }

    async fn read_relations<R>(
        &self,
        _filter: RelationshipFilter<
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
        >,
        _consistency: Consistency<'_>,
    ) -> Result<Vec<R>, Report<ReadError>> {
        Ok(Vec::new())
    }
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
    /// If the subject has the specified permission or relation to an [`Object`].
    pub has_permission: bool,
    /// A token to determine the time at which the check was performed.
    pub checked_at: Zookie<'static>,
}

impl CheckResponse {
    /// Asserts that the subject has the specified permission or relation to an [`Object`].
    ///
    /// # Errors
    ///
    /// Returns an error if the subject does not have the specified permission or relation to the
    /// [`Object`].
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
pub struct CheckError;

impl fmt::Display for CheckError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to check permission")
    }
}

impl Error for CheckError {}

/// Error returned from [`ZanzibarBackend::check`].
#[derive(Debug)]
pub struct ReadError;

impl fmt::Display for ReadError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to read relationships")
    }
}

impl Error for ReadError {}

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
