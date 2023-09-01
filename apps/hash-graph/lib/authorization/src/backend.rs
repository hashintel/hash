mod spicedb;

use core::fmt;
use std::error::Error;

use error_stack::Report;

pub use self::spicedb::{SpiceDb, SpiceDbConfig};
use crate::zanzibar::{Affiliation, Consistency, Relation, Resource, Tuple, UntypedTuple, Zookie};

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

    /// Creates a new relation specified by the [`Tuple`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation already exists or could not be created.
    async fn create_relation<'p, 't, T>(
        &mut self,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
        preconditions: impl IntoIterator<Item = Precondition<'p>, IntoIter: Send> + Send + 'p,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Tuple + Send + Sync + 't;

    /// Deletes the relation specified by the [`Tuple`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation does not exist or could not be deleted.
    async fn delete_relation<'p, 't, T>(
        &mut self,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
        preconditions: impl IntoIterator<Item = Precondition<'p>, IntoIter: Send> + Send + 'p,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        T: Tuple + Send + Sync + 't;

    /// Deletes all relations matching the specified [`RelationFilter`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relations could not be deleted.
    async fn delete_relations<'f>(
        &mut self,
        filter: RelationFilter<'_>,
        preconditions: impl IntoIterator<Item = Precondition<'f>> + Send,
    ) -> Result<DeleteRelationsResponse, Report<DeleteRelationsError>>;

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
    async fn check(
        &self,
        tuple: &(impl Tuple + Sync),
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>;
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
pub struct CreateRelationError;

impl fmt::Display for CreateRelationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to create relations")
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
pub struct DeleteRelationError;

impl fmt::Display for DeleteRelationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to delete relation")
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
    /// If the subject has the specified permission or relation to an [`Resource`].
    pub has_permission: bool,
    /// A token to determine the time at which the check was performed.
    pub checked_at: Zookie<'static>,
}

/// Error returned from [`AuthorizationApi::check`].
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

pub struct SubjectFilter<'s> {
    pub namespace: &'s str,
    pub id: Option<&'s str>,
    pub affiliation: Option<&'s str>,
}

pub struct RelationFilter<'f> {
    pub namespace: &'f str,
    pub id: Option<&'f str>,
    pub affiliation: Option<&'f str>,
    pub subject: Option<SubjectFilter<'f>>,
}

pub struct Precondition<'f> {
    pub must_match: bool,
    pub filter: RelationFilter<'f>,
}

impl<'f> Precondition<'f> {
    #[must_use]
    pub const fn must_match(filter: RelationFilter<'f>) -> Self {
        Self {
            must_match: true,
            filter,
        }
    }

    #[must_use]
    pub const fn must_not_match(filter: RelationFilter<'f>) -> Self {
        Self {
            must_match: false,
            filter,
        }
    }
}

impl<'f> RelationFilter<'f> {
    #[must_use]
    pub const fn for_resource_namespace(namespace: &'f str) -> Self {
        Self {
            namespace,
            id: None,
            affiliation: None,
            subject: None,
        }
    }

    pub fn for_resource<R>(resource: &'f R) -> Self
    where
        R: Resource + ?Sized,
    {
        Self {
            namespace: resource.namespace(),
            id: Some(resource.id().as_ref()),
            affiliation: None,
            subject: None,
        }
    }

    #[must_use]
    pub fn by_relation<A, R>(mut self, relation: &'f A) -> Self
    where
        A: Relation<R> + ?Sized,
        R: Resource + ?Sized,
    {
        self.affiliation = Some(relation.as_ref());
        self
    }

    #[must_use]
    pub fn by_permission<A, R>(mut self, permission: &'f A) -> Self
    where
        A: Relation<R> + ?Sized,
        R: Resource + ?Sized,
    {
        self.affiliation = Some(permission.as_ref());
        self
    }

    #[must_use]
    pub const fn with_subject_namespace<S>(mut self, namespace: &'f str) -> Self {
        self.subject = Some(SubjectFilter {
            namespace,
            id: None,
            affiliation: None,
        });
        self
    }

    #[must_use]
    pub fn with_subject<S>(mut self, subject: &'f S) -> Self
    where
        S: Resource + ?Sized,
    {
        self.subject = Some(SubjectFilter {
            namespace: subject.namespace(),
            id: Some(subject.id().as_ref()),
            affiliation: None,
        });
        self
    }

    #[must_use]
    pub fn with_subject_set<S, A>(mut self, subject: &'f S, affiliation: &'f A) -> Self
    where
        S: Resource + ?Sized,
        A: Affiliation<S> + ?Sized,
    {
        self.subject = Some(SubjectFilter {
            namespace: subject.namespace(),
            id: Some(subject.id().as_ref()),
            affiliation: Some(affiliation.as_ref()),
        });
        self
    }
}
