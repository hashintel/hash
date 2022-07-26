pub mod error;
mod pool;
mod postgres;

use std::fmt;

use async_trait::async_trait;
use error_stack::{Context, Result};

pub use self::{
    error::{BaseUriAlreadyExists, BaseUriDoesNotExist, InsertionError, QueryError, UpdateError},
    pool::StorePool,
    postgres::{AsClient, PostgresStore, PostgresStorePool},
};
use crate::{
    knowledge::{Entity, EntityId, Link, LinkId, Links},
    ontology::{
        types::{uri::VersionedUri, DataType, EntityType, LinkType, Persisted, PropertyType},
        AccountId, VersionId,
    },
};

#[derive(Debug)]
pub struct StoreError;

impl Context for StoreError {}

impl fmt::Display for StoreError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The store encountered an error")
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

/// Describes the API of a store implementation.
///
/// # Errors
///
/// In addition to the errors described in the methods of this trait, further errors might also be
/// raised depending on the implementation, e.g. connection issues.
#[async_trait]
pub trait Store {
    /// Fetches the [`VersionId`] of the specified [`VersionedUri`].
    ///
    /// # Errors:
    ///
    /// - if the entry referred to by `uri` does not exist.
    async fn version_id_by_uri(&self, uri: &VersionedUri) -> Result<VersionId, QueryError>;
    /// Creates a new [`DataType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `data_type` already exist.
    ///
    /// [`BaseUri`]: crate::ontology::types::uri::BaseUri
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<Persisted<DataType>, InsertionError>;

    /// Get an existing [`DataType`] by a [`VersionId`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    async fn get_data_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Persisted<DataType>, QueryError>;

    /// Update the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    async fn update_data_type(
        &mut self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<Persisted<DataType>, UpdateError>;

    /// Creates a new [`PropertyType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `property_type` already exists.
    ///
    /// [`BaseUri`]: crate::ontology::types::uri::BaseUri
    async fn create_property_type(
        &mut self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<Persisted<PropertyType>, InsertionError>;

    /// Get an existing [`PropertyType`] by a [`VersionId`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    async fn get_property_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Persisted<PropertyType>, QueryError>;

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<Persisted<PropertyType>, UpdateError>;

    /// Creates a new [`EntityType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `entity_type` already exist.
    ///
    /// [`BaseUri`]: crate::ontology::types::uri::BaseUri
    async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
        created_by: AccountId,
    ) -> Result<Persisted<EntityType>, InsertionError>;

    /// Get an existing [`EntityType`] by a [`VersionId`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    async fn get_entity_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Persisted<EntityType>, QueryError>;

    /// Update the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        updated_by: AccountId,
    ) -> Result<Persisted<EntityType>, UpdateError>;

    // TODO - perhaps we want to separate the store into the Type Graph and the Data Graph

    /// Creates a new [`LinkType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `property_type` already exists.
    ///
    /// [`BaseUri`]: crate::ontology::types::uri::BaseUri
    async fn create_link_type(
        &mut self,
        link_type: LinkType,
        created_by: AccountId,
    ) -> Result<Persisted<LinkType>, InsertionError>;

    /// Get an existing [`LinkType`] by a [`VersionId`].
    ///
    /// # Errors
    ///
    /// - if the requested [`LinkType`] doesn't exist.
    async fn get_link_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Persisted<LinkType>, QueryError>;

    /// Update the definition of an existing [`LinkType`].
    ///
    /// # Errors
    ///
    /// - if the [`LinkType`] doesn't exist.
    async fn update_link_type(
        &mut self,
        property_type: LinkType,
        updated_by: AccountId,
    ) -> Result<Persisted<LinkType>, UpdateError>;

    /// Creates a new [`Entity`].
    ///
    /// # Errors:
    ///
    /// - if the [`EntityType`] doesn't exist
    /// - if the [`Entity`] is not valid with respect to the specified [`EntityType`]
    /// - if the account referred to by `created_by` does not exist
    async fn create_entity(
        &mut self,
        entity: &Entity,
        entity_type_uri: VersionedUri,
        created_by: AccountId,
    ) -> Result<EntityId, InsertionError>;

    /// Get the latest version of the [`Entity`] identified by [`EntityId`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entity`] doesn't exist
    async fn get_entity(&mut self, entity_id: EntityId) -> Result<Entity, QueryError>;

    /// Update an existing [`Entity`].
    ///
    /// # Errors
    ///
    /// - if the [`Entity`] doesn't exist
    /// - if the [`EntityType`] doesn't exist
    /// - if the [`Entity`] is not valid with respect to its [`EntityType`]
    /// - if the account referred to by `updated_by` does not exist
    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        entity: &Entity,
        entity_type_uri: VersionedUri,
        updated_by: AccountId,
    ) -> Result<(), UpdateError>;

    /// Get a [`Link`] target identified by an [`EntityId`] and a Link Type [`VersionedUri`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entity`] doesn't exist
    async fn get_link_target(
        &self,
        source_entity_id: EntityId,
        link_type_uri: VersionedUri,
    ) -> Result<Link, QueryError>;

    /// Get [`Links`] of an [`Entity`] identified by an [`EntityId`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entity`] doesn't exist
    async fn get_entity_links(&self, source_entity_id: EntityId) -> Result<Links, QueryError>;

    /// Creates a new [`Link`].
    ///
    /// # Errors:
    ///
    /// - if the [`LinkType`] doesn't exist
    /// - if the [`Link`] is not valid with respect to the specified [`LinkType`]
    /// - if the account referred to by `created_by` does not exist
    async fn create_link(
        &mut self,
        source_entity: EntityId,
        target_entity: EntityId,
        link_type_uri: VersionedUri,
        created_by: AccountId,
    ) -> Result<LinkId, InsertionError>;

    /// Removes a [`Link`] between a source and target [`Entity`].
    ///
    /// # Errors:
    ///
    /// - if the [`Link`] doesn't exist
    /// - if the account referred to by `created_by` does not exist
    async fn remove_link(
        &mut self,
        source_entity: EntityId,
        target_entity: EntityId,
        link_type_uri: VersionedUri,
    ) -> Result<(), InsertionError>;
}
