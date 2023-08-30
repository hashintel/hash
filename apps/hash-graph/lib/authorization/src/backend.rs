mod spicedb;

use core::fmt;
use std::error::Error;

use error_stack::Report;

pub use self::spicedb::{SpiceDb, SpiceDbConfig};
use crate::zanzibar::{
    Affiliation, Consistency, Permission, Relation, Resource, StringTuple, Subject, Zookie,
};

/// A backend for interacting with an authorization system based on the Zanzibar model.
pub trait AuthorizationApi {
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

    /// Creates a new relation between a [`Subject`] and an [`Resource`] with the specified
    /// [`Relation`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation already exists or could not be created.
    async fn create_relation<R, A, S>(
        &mut self,
        resource: &R,
        relation: &A,
        subject: &S,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        R: Resource + ?Sized + Sync,
        A: Relation<R> + ?Sized + Sync,
        S: Subject + ?Sized + Sync;

    /// Deletes a relation between a [`Subject`] and an [`Resource`] with the specified
    /// [`Relation`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation does not exist or could not be deleted.
    async fn delete_relation<R, A, S>(
        &mut self,
        resource: &R,
        relation: &A,
        subject: &S,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        R: Resource + ?Sized + Sync,
        A: Relation<R> + ?Sized + Sync,
        S: Subject + ?Sized + Sync;

    /// Deletes all relations matching the specified [`RelationFilter`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relations could not be deleted.
    async fn delete_relations<'f, R>(
        &mut self,
        filter: RelationFilter<'_, R>,
        preconditions: impl IntoIterator<Item = Precondition<'f, R>> + Send,
    ) -> Result<DeleteRelationsResponse, Report<DeleteRelationsError>>
    where
        R: Resource<Namespace: Sync, Id: Sync> + ?Sized + 'f;

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

/// Return value for [`AuthorizationApi::import_schema`].
#[derive(Debug)]
pub struct ImportSchemaResponse {
    /// A token to determine the time at which the schema was writte.
    pub written_at: Zookie<'static>,
}

/// Error returned from [`AuthorizationApi::import_schema`].
#[derive(Debug)]
pub struct ImportSchemaError;

impl fmt::Display for ImportSchemaError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to import schema")
    }
}

impl Error for ImportSchemaError {}

/// Return value for [`AuthorizationApi::export_schema`].
#[derive(Debug)]
pub struct ExportSchemaResponse {
    /// The schema text.
    pub schema: String,
    /// A token to determine the time at which the schema was read.
    pub read_at: Zookie<'static>,
}

/// Error returned from [`AuthorizationApi::export_schema`].
#[derive(Debug)]
pub struct ExportSchemaError;

impl fmt::Display for ExportSchemaError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to export schema")
    }
}

impl Error for ExportSchemaError {}

/// Return value for [`AuthorizationApi::create_relation`].
#[derive(Debug)]
pub struct CreateRelationResponse {
    /// A token to determine the time at which the relation was created.
    pub written_at: Zookie<'static>,
}

/// Error returned from [`AuthorizationApi::create_relation`].
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

/// Return value for [`AuthorizationApi::delete_relation`].
#[derive(Debug)]
pub struct DeleteRelationResponse {
    /// A token to determine the time at which the relation was deleted.
    pub deleted_at: Zookie<'static>,
}

/// Error returned from [`AuthorizationApi::delete_relation`].
#[derive(Debug)]
pub struct DeleteRelationError {
    pub tuple: StringTuple,
}

impl fmt::Display for DeleteRelationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "failed to delete relation: `{}`", self.tuple)
    }
}

impl Error for DeleteRelationError {}

/// Return value for [`AuthorizationApi::delete_relation`].
#[derive(Debug)]
pub struct DeleteRelationsResponse {
    /// A token to determine the time at which the relation was deleted.
    pub deleted_at: Zookie<'static>,
}

/// Error returned from [`AuthorizationApi::delete_relation`].
#[derive(Debug)]
pub struct DeleteRelationsError;

impl fmt::Display for DeleteRelationsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to delete relations")
    }
}

impl Error for DeleteRelationsError {}

/// Return value for [`AuthorizationApi::check`].
#[derive(Debug)]
pub struct CheckResponse {
    /// If the [`Subject`] has the specified permission or relation to an [`Resource`].
    pub has_permission: bool,
    /// A token to determine the time at which the check was performed.
    pub checked_at: Zookie<'static>,
}

/// Error returned from [`AuthorizationApi::check`].
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

pub struct SubjectFilter<'s> {
    pub namespace: &'s str,
    pub id: Option<&'s str>,
    pub affiliation: Option<&'s str>,
}

pub struct RelationFilter<'f, R: Resource + ?Sized> {
    pub namespace: &'f R::Namespace,
    pub id: Option<&'f R::Id>,
    pub affiliation: Option<&'f str>,
    pub subject: Option<SubjectFilter<'f>>,
}

pub struct Precondition<'f, R: Resource + ?Sized> {
    pub must_match: bool,
    pub filter: RelationFilter<'f, R>,
}

impl<'f, R: Resource + ?Sized> Precondition<'f, R> {
    #[must_use]
    pub const fn must_match(filter: RelationFilter<'f, R>) -> Self {
        Self {
            must_match: true,
            filter,
        }
    }

    #[must_use]
    pub const fn must_not_match(filter: RelationFilter<'f, R>) -> Self {
        Self {
            must_match: false,
            filter,
        }
    }
}

impl<'f, R> RelationFilter<'f, R>
where
    R: Resource + ?Sized,
{
    pub const fn for_resource_namespace(namespace: &'f R::Namespace) -> Self {
        Self {
            namespace,
            id: None,
            affiliation: None,
            subject: None,
        }
    }

    pub fn for_resource(resource: &'f R) -> Self {
        Self {
            namespace: resource.namespace(),
            id: Some(resource.id()),
            affiliation: None,
            subject: None,
        }
    }

    #[must_use]
    pub fn by_relation<A>(mut self, relation: &'f A) -> Self
    where
        A: Relation<R> + ?Sized,
    {
        self.affiliation = Some(relation.as_ref());
        self
    }

    #[must_use]
    pub fn by_permission<A>(mut self, permission: &'f A) -> Self
    where
        A: Permission<R> + ?Sized,
    {
        self.affiliation = Some(permission.as_ref());
        self
    }

    #[must_use]
    pub fn with_subject_namespace<S>(
        mut self,
        namespace: &'f <S::Resource as Resource>::Namespace,
    ) -> Self
    where
        S: Subject + ?Sized,
    {
        self.subject = Some(SubjectFilter {
            namespace: namespace.as_ref(),
            id: None,
            affiliation: None,
        });
        self
    }

    #[must_use]
    pub fn with_subject<S>(mut self, subject: &'f S) -> Self
    where
        S: Subject + ?Sized,
    {
        let resource = subject.resource();
        self.subject = Some(SubjectFilter {
            namespace: resource.namespace().as_ref(),
            id: Some(resource.id().as_ref()),
            affiliation: subject.affiliation().map(AsRef::as_ref),
        });
        self
    }
}
