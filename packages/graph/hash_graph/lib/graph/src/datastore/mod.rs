mod error;
mod postgres;

use std::fmt;

use async_trait::async_trait;
use error_stack::{Context, Result};

pub use self::{
    error::{BaseUriAlreadyExists, BaseUriDoesNotExist, InsertionError, QueryError, UpdateError},
    postgres::PostgresDatabase,
};
use crate::types::{
    schema::{DataType, EntityType, PropertyType},
    AccountId, Qualified, VersionId,
};

#[derive(Debug)]
pub struct DatastoreError;

impl Context for DatastoreError {}

impl fmt::Display for DatastoreError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The Datastore encountered an error")
    }
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ArgEnum))]
pub enum DatabaseType {
    #[default]
    Postgres,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct DatabaseConnectionInfo {
    /// The database type to connect to
    #[cfg_attr(feature = "clap", clap(long, default_value = "postgres", arg_enum))]
    database_type: DatabaseType,

    /// Database username
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "postgres", env = "HASH_GRAPH_USER")
    )]
    user: String,

    /// Database password for authentication
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "postgres", env = "HASH_GRAPH_PASSWORD")
    )]
    password: String,

    /// The host to connect to
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "localhost", env = "HASH_GRAPH_HOST")
    )]
    host: String,

    /// The port to connect to
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "5432", env = "HASH_GRAPH_PORT")
    )]
    port: u16,

    /// The database name to use
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "graph", env = "HASH_GRAPH_DATABASE")
    )]
    database: String,
}

impl DatabaseConnectionInfo {
    #[must_use]
    pub const fn new(
        database_type: DatabaseType,
        user: String,
        password: String,
        host: String,
        port: u16,
        database: String,
    ) -> Self {
        Self {
            database_type,
            user,
            password,
            host,
            port,
            database,
        }
    }

    /// Creates a database connection url.
    ///
    /// Note, that this will reveal the password, so the returned output should not be printed. The
    /// [`Display`] implementation should be used instead, which will mask the password.
    ///
    /// [`Display`]: core::fmt::Display.
    #[must_use]
    pub fn url(&self) -> String {
        let db_type = match self.database_type {
            DatabaseType::Postgres => "postgres",
        };
        format!(
            "{}://{}:{}@{}:{}/{}",
            db_type, self.user, self.password, self.host, self.port, self.database
        )
    }

    #[must_use]
    pub const fn database_type(&self) -> DatabaseType {
        self.database_type
    }

    #[must_use]
    pub fn user(&self) -> &str {
        &self.user
    }

    /// Returns the password in plain text.
    ///
    /// Note, that this will reveal the password, so the returned output should not be printed.
    #[must_use]
    pub fn password(&self) -> &str {
        &self.password
    }

    #[must_use]
    pub fn host(&self) -> &str {
        &self.host
    }

    #[must_use]
    pub const fn port(&self) -> u16 {
        self.port
    }

    #[must_use]
    pub fn database(&self) -> &str {
        &self.database
    }
}

impl fmt::Display for DatabaseConnectionInfo {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let db_type = match self.database_type {
            DatabaseType::Postgres => "postgres",
        };
        write!(
            fmt,
            "{}://{}:***@{}:{}/{}",
            db_type, self.user, self.host, self.port, self.database
        )
    }
}

/// Describes the API of a Datastore implementation.
///
/// # Errors
///
/// In addition to the errors described in the methods of this trait, further errors might also be
/// raised depending on the implementation, e.g. connection issues.
#[async_trait]
pub trait Datastore: Clone + Send + Sync + 'static {
    /// Creates a new [`DataType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `data_type` already exist.
    ///
    /// [`BaseUri`]: crate::types::BaseUri
    async fn create_data_type(
        &self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<Qualified<DataType>, InsertionError>;

    /// Get an existing [`DataType`] by a [`VersionId`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    async fn get_data_type(&self, version_id: VersionId)
    -> Result<Qualified<DataType>, QueryError>;

    /// Update the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    async fn update_data_type(
        &self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<Qualified<DataType>, UpdateError>;

    /// Creates a new [`PropertyType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `property_type` already exists.
    ///
    /// [`BaseUri`]: crate::types::BaseUri
    async fn create_property_type(
        &self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<Qualified<PropertyType>, InsertionError>;

    /// Get an existing [`PropertyType`] by a [`VersionId`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    async fn get_property_type(
        &self,
        version_id: VersionId,
    ) -> Result<Qualified<PropertyType>, QueryError>;

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    async fn update_property_type(
        &self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<Qualified<PropertyType>, UpdateError>;

    /// Creates a new [`EntityType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `entity_type` already exist.
    ///
    /// [`BaseUri`]: crate::types::BaseUri
    async fn create_entity_type(
        &self,
        entity_type: EntityType,
        created_by: AccountId,
    ) -> Result<Qualified<EntityType>, InsertionError>;

    /// Get an existing [`EntityType`] by a [`VersionId`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    async fn get_entity_type(
        &self,
        version_id: VersionId,
    ) -> Result<Qualified<EntityType>, QueryError>;

    /// Update the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    async fn update_entity_type(
        &self,
        entity_type: EntityType,
        updated_by: AccountId,
    ) -> Result<Qualified<EntityType>, UpdateError>;

    // TODO - perhaps we want to separate the Datastore into the Type Graph and the Data Graph

    /// Creates a new `Entity`.
    async fn create_entity() -> Result<(), InsertionError>;

    /// Get an existing `Entity`.
    ///
    /// # Errors
    ///
    /// - if the requested `Entity` doesn't exist.
    async fn get_entity() -> Result<(), QueryError>;

    /// Updates an existing `Entity`.
    ///
    /// # Errors
    ///
    /// - if the `Entity` doesn't exist.
    async fn update_entity() -> Result<(), UpdateError>;
}
