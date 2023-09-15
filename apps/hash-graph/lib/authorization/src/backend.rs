mod spicedb;

use core::fmt;
use std::error::Error;

use error_stack::Report;

pub use self::spicedb::SpiceDbOpenApi;
use crate::zanzibar::{Affiliation, Consistency, Relation, Resource, Tuple, UntypedTuple, Zookie};

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
    async fn create_relations<'p, 't, T>(
        &mut self,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
        preconditions: impl IntoIterator<Item = Precondition<'p, T::Object, T::User>, IntoIter: Send>
        + Send
        + 'p,
    ) -> Result<CreateRelationResponse, Report<CreateRelationError>>
    where
        T: Tuple + 't,
        <T::Object as Resource>::Id: Sync + 'p,
        <T::User as Resource>::Id: Sync + 'p;

    /// Deletes the relation specified by the [`Tuple`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relation does not exist or could not be deleted.
    async fn delete_relations<'p, 't, T>(
        &mut self,
        tuples: impl IntoIterator<Item = &'t T, IntoIter: Send> + Send,
        preconditions: impl IntoIterator<Item = Precondition<'p, T::Object, T::User>, IntoIter: Send>
        + Send
        + 'p,
    ) -> Result<DeleteRelationResponse, Report<DeleteRelationError>>
    where
        T: Tuple + 't,
        <T::Object as Resource>::Id: Sync + 'p,
        <T::User as Resource>::Id: Sync + 'p;

    /// Deletes all relations matching the specified [`RelationFilter`].
    ///
    /// # Errors
    ///
    /// Returns an error if the relations could not be deleted.
    async fn delete_relations_by_filter<'f, O, U>(
        &mut self,
        filter: RelationFilter<'_, O, U>,
        preconditions: impl IntoIterator<Item = Precondition<'f, O, U>> + Send,
    ) -> Result<DeleteRelationsResponse, Report<DeleteRelationsError>>
    where
        O: Resource<Id: Sync + 'f> + ?Sized,
        U: Resource<Id: Sync + 'f> + ?Sized;

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
    async fn check<T>(
        &self,
        tuple: &T,
        consistency: Consistency<'_>,
    ) -> Result<CheckResponse, Report<CheckError>>
    where
        T: Tuple + Sync,
        <T::Object as Resource>::Id: Sync,
        <T::User as Resource>::Id: Sync;
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

/// Return value for [`ZanzibarBackend::delete_relations`].
#[derive(Debug)]
pub struct DeleteRelationsResponse {
    /// A token to determine the time at which the relation was deleted.
    pub deleted_at: Zookie<'static>,
}

/// Error returned from [`ZanzibarBackend::delete_relations`].
#[derive(Debug)]
pub struct DeleteRelationsError;

impl fmt::Display for DeleteRelationsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("failed to delete relations")
    }
}

impl Error for DeleteRelationsError {}

/// Return value for [`ZanzibarBackend::check`].
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

pub struct UserFilter<'s, R>
where
    R: Resource + ?Sized,
{
    pub id: Option<&'s R::Id>,
    pub affiliation: Option<&'s str>,
}

pub struct RelationFilter<'f, O, U>
where
    O: Resource + ?Sized,
    U: Resource + ?Sized,
{
    pub id: Option<&'f O::Id>,
    pub affiliation: Option<&'f str>,
    pub subject: Option<UserFilter<'f, U>>,
}

pub struct Precondition<'f, O, U>
where
    O: Resource + ?Sized,
    U: Resource + ?Sized,
{
    pub must_match: bool,
    pub filter: RelationFilter<'f, O, U>,
}

impl<'f, O, U> Precondition<'f, O, U>
where
    O: Resource + ?Sized,
    U: Resource + ?Sized,
{
    #[must_use]
    pub const fn must_match(filter: RelationFilter<'f, O, U>) -> Self {
        Self {
            must_match: true,
            filter,
        }
    }

    #[must_use]
    pub const fn must_not_match(filter: RelationFilter<'f, O, U>) -> Self {
        Self {
            must_match: false,
            filter,
        }
    }
}

impl<'f, O, U> RelationFilter<'f, O, U>
where
    O: Resource + ?Sized,
    U: Resource + ?Sized,
{
    #[must_use]
    pub const fn for_object_namespace() -> Self {
        Self {
            id: None,
            affiliation: None,
            subject: None,
        }
    }

    pub fn for_object(object: &'f O) -> Self {
        Self {
            id: Some(object.id()),
            affiliation: None,
            subject: None,
        }
    }

    #[must_use]
    pub fn by_relation<A>(mut self, relation: &'f A) -> Self
    where
        A: Relation<O> + ?Sized,
    {
        self.affiliation = Some(relation.as_ref());
        self
    }

    #[must_use]
    pub const fn with_user_namespace(mut self) -> Self {
        self.subject = Some(UserFilter {
            id: None,
            affiliation: None,
        });
        self
    }

    #[must_use]
    pub fn with_user(mut self, user: &'f U) -> Self {
        self.subject = Some(UserFilter {
            id: Some(user.id()),
            affiliation: None,
        });
        self
    }

    #[must_use]
    pub fn with_user_set<A>(mut self, user: &'f U, affiliation: &'f A) -> Self
    where
        A: Affiliation<U> + ?Sized,
    {
        self.subject = Some(UserFilter {
            id: Some(user.id()),
            affiliation: Some(affiliation.as_ref()),
        });
        self
    }
}
