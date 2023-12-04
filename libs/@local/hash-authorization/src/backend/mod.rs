mod spicedb;

use core::{fmt, iter::repeat};
use std::{error::Error, future::Future};

use error_stack::Report;
use serde::{de::DeserializeOwned, Deserialize, Serialize};

pub use self::spicedb::{RpcError, SpiceDbOpenApi};
use crate::{
    zanzibar::{
        types::{Relationship, RelationshipFilter, Resource, Subject},
        Consistency, Permission, Zookie,
    },
    NoAuthorization,
};

/// Used for mutating a single relationship within the service.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "snake_case")]
pub enum ModifyRelationshipOperation {
    /// Upsert the relationship, and will not error if it already exists.
    Touch,
    /// Create the relationship only if it doesn't exist, and error otherwise.
    Create,
    /// Delete the relationship. If the relationship does not exist, this operation will no-op.
    Delete,
}

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

    fn modify_relationships<R>(
        &mut self,
        relationships: impl IntoIterator<Item = (ModifyRelationshipOperation, R), IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<ModifyRelationshipResponse, Report<ModifyRelationshipError>>> + Send
    where
        R: Relationship<
                Resource: Resource<Kind: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Resource<Kind: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync;

    /// Creates a new relation specified by the [`Relationship`] but does not error if it already
    /// exists.
    ///
    /// This is the same behavior as [`ZanzibarBackend::modify_relationships`] with
    /// [`ModifyRelationshipOperation::Touch`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation could not be created.
    fn touch_relationships<R>(
        &mut self,
        relationships: impl IntoIterator<Item = R, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<ModifyRelationshipResponse, Report<ModifyRelationshipError>>> + Send
    where
        R: Relationship<
                Resource: Resource<Kind: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Resource<Kind: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync,
    {
        self.modify_relationships(repeat(ModifyRelationshipOperation::Touch).zip(relationships))
    }

    /// Creates a new relation specified by the [`Relationship`].
    ///
    /// This is the same behavior as [`ZanzibarBackend::modify_relationships`] with
    /// [`ModifyRelationshipOperation::Create`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation already exists or could not be created.
    fn create_relationships<R>(
        &mut self,
        relationships: impl IntoIterator<Item = R, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<ModifyRelationshipResponse, Report<ModifyRelationshipError>>> + Send
    where
        R: Relationship<
                Resource: Resource<Kind: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Resource<Kind: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync,
    {
        self.modify_relationships(repeat(ModifyRelationshipOperation::Create).zip(relationships))
    }

    /// Deletes the relation specified by the [`Relationship`].
    ///
    /// This is the same behavior as [`ZanzibarBackend::modify_relationships`] with
    /// [`ModifyRelationshipOperation::Delete`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation does not exist or could not be deleted.
    fn delete_relationships<R>(
        &mut self,
        relationships: impl IntoIterator<Item = R, IntoIter: Send> + Send,
    ) -> impl Future<Output = Result<ModifyRelationshipResponse, Report<ModifyRelationshipError>>> + Send
    where
        R: Relationship<
                Resource: Resource<Kind: Serialize, Id: Serialize>,
                Relation: Serialize,
                Subject: Resource<Kind: Serialize, Id: Serialize>,
                SubjectSet: Serialize,
            > + Send
            + Sync,
    {
        self.modify_relationships(repeat(ModifyRelationshipOperation::Delete).zip(relationships))
    }

    /// Returns if the [`Subject`] of the [`Relationship`] has the specified [`Permission`] to a
    /// [`Resource`].
    ///
    /// # Errors
    ///
    /// Returns an error if the check could not be performed.
    ///
    /// Note, that this will not fail if the [`Subject`] does not have the specified permission or
    /// relation to the [`Subject`]. Instead, the [`CheckResponse::has_permission`] field will be
    /// set to `false`.
    fn check_permission<O, R, S>(
        &self,
        resource: &O,
        permission: &R,
        subject: &S,
        consistency: Consistency<'_>,
    ) -> impl Future<Output = Result<CheckResponse, Report<CheckError>>> + Send
    where
        O: Resource<Kind: Serialize, Id: Serialize> + Sync,
        R: Serialize + Permission<O> + Sync,
        S: Subject<Resource: Resource<Kind: Serialize, Id: Serialize>, Relation: Serialize> + Sync;

    /// Checks a list [`Relationship`]s if the [`Subject`] of it has the specified [`Permission`] to
    /// a [`Resource`].
    ///
    /// # Errors
    ///
    /// Returns an error if the check could not be performed.
    ///
    /// Note, that this will not fail if the [`Subject`] does not have the specified permission or
    /// relation to the [`Subject`]. Instead, the [`CheckResponse::has_permission`] field will be
    /// set to `false`.
    fn check_permissions<O, R, S>(
        &self,
        relationships: impl IntoIterator<Item = (O, R, S)> + Send,
        consistency: Consistency<'_>,
    ) -> impl Future<
        Output = Result<
            BulkCheckResponse<impl IntoIterator<Item = BulkCheckItem<O, R, S>>>,
            Report<CheckError>,
        >,
    > + Send
    where
        O: Resource<Kind: Serialize + DeserializeOwned, Id: Serialize + DeserializeOwned>
            + Send
            + Sync,
        R: Serialize + DeserializeOwned + Permission<O> + Send + Sync,
        S: Subject<
                Resource: Resource<
                    Kind: Serialize + DeserializeOwned,
                    Id: Serialize + DeserializeOwned,
                >,
                Relation: Serialize + DeserializeOwned,
            > + Send
            + Sync;

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
                Resource: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
                Relation: Deserialize<'de>,
                Subject: Resource<Kind: Deserialize<'de>, Id: Deserialize<'de>>,
                SubjectSet: Deserialize<'de>,
            > + Send;

    /// Deletes all relationships matching the given filter
    ///
    /// # Errors
    ///
    /// Returns an error if the deletion could not be performed.
    fn delete_relations(
        &mut self,
        filter: RelationshipFilter<
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
        >,
    ) -> impl Future<Output = Result<DeleteRelationshipResponse, Report<DeleteRelationshipError>>> + Send;
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

    async fn modify_relationships<T>(
        &mut self,
        _tuples: impl IntoIterator<Item = (ModifyRelationshipOperation, T), IntoIter: Send> + Send,
    ) -> Result<ModifyRelationshipResponse, Report<ModifyRelationshipError>>
    where
        T: Sync,
    {
        Ok(ModifyRelationshipResponse {
            written_at: Zookie::empty(),
        })
    }

    async fn check_permission<O, R, S>(
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

    async fn check_permissions<O, R, S>(
        &self,
        relationships: impl IntoIterator<Item = (O, R, S)> + Send,
        _consistency: Consistency<'_>,
    ) -> Result<
        BulkCheckResponse<impl IntoIterator<Item = BulkCheckItem<O, R, S>>>,
        Report<CheckError>,
    > {
        Ok(BulkCheckResponse {
            permission_iterator: relationships.into_iter().map(
                |(resource, permission, subject)| BulkCheckItem {
                    resource,
                    permission,
                    subject,
                    has_permission: Ok(true),
                },
            ),
            checked_at: Zookie::empty(),
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

    async fn delete_relations(
        &mut self,
        _filter: RelationshipFilter<
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
            impl Serialize + Send + Sync,
        >,
    ) -> Result<DeleteRelationshipResponse, Report<DeleteRelationshipError>> {
        Ok(DeleteRelationshipResponse {
            deleted_at: Zookie::empty(),
        })
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

/// Return value for [`ZanzibarBackend::create_relationships`].
#[derive(Debug)]
pub struct ModifyRelationshipResponse {
    /// A token to determine the time at which the relation was created.
    pub written_at: Zookie<'static>,
}

/// Error returned from [`ZanzibarBackend::create_relationships`].
#[derive(Debug)]
pub struct ModifyRelationshipError;

impl fmt::Display for ModifyRelationshipError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to modify relationships")
    }
}

impl Error for ModifyRelationshipError {}

/// Return value for [`ZanzibarBackend::delete_relationships`].
#[derive(Debug)]
pub struct DeleteRelationshipResponse {
    /// A token to determine the time at which the relation was created.
    pub deleted_at: Zookie<'static>,
}

/// Error returned from [`ZanzibarBackend::delete_relationships`].
#[derive(Debug)]
pub struct DeleteRelationshipError;

impl fmt::Display for DeleteRelationshipError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to delete relationships")
    }
}

impl Error for DeleteRelationshipError {}

/// Return value for [`ZanzibarBackend::check_permission`].
#[derive(Debug)]
#[must_use]
pub struct CheckResponse {
    /// If the subject has the specified permission or relation to an [`Resource`].
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
    pub fn assert_permission(self) -> Result<Zookie<'static>, PermissionAssertion> {
        if self.has_permission {
            Ok(self.checked_at)
        } else {
            Err(PermissionAssertion)
        }
    }
}

/// Return value for [`ZanzibarBackend::check_permissions`].
#[derive(Debug)]
#[must_use]
pub struct BulkCheckResponse<I> {
    /// If the subject has the specified permission or relation to an [`Resource`].
    pub permission_iterator: I,
    /// A token to determine the time at which the check was performed.
    pub checked_at: Zookie<'static>,
}

/// Return value for [`ZanzibarBackend::check_permissions`].
#[derive(Debug)]
#[must_use]
pub struct BulkCheckItem<R, P, S> {
    pub resource: R,
    pub permission: P,
    pub subject: S,
    /// A token to determine the time at which the check was performed.
    pub has_permission: Result<bool, RpcError>,
}

/// Error returned from [`ZanzibarBackend::check_permission`] and
/// [`ZanzibarBackend::check_permission`].
#[derive(Debug)]
pub struct CheckError;

impl fmt::Display for CheckError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to check permission")
    }
}

impl Error for CheckError {}

/// Error returned from [`ZanzibarBackend::read_relations`].
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
