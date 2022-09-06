pub mod crud;
pub mod error;
pub mod query;

mod pool;
mod postgres;

use std::fmt;

use async_trait::async_trait;
use error_stack::{Context, Result};
use type_system::{uri::VersionedUri, DataType, EntityType, LinkType, PropertyType};

pub use self::{
    error::{BaseUriAlreadyExists, BaseUriDoesNotExist, InsertionError, QueryError, UpdateError},
    pool::StorePool,
    postgres::{AsClient, PostgresStore, PostgresStorePool},
};
use crate::{
    knowledge::{Entity, EntityId, Link, PersistedEntity, PersistedEntityIdentifier},
    ontology::{
        AccountId, PersistedDataType, PersistedEntityType, PersistedLinkType,
        PersistedOntologyIdentifier, PersistedPropertyType,
    },
    store::{error::LinkActivationError, query::Expression},
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
        clap(long, default_value = "postgres", env = "HASH_GRAPH_PG_USER")
    )]
    user: String,

    /// Database password for authentication
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "postgres", env = "HASH_GRAPH_PG_PASSWORD")
    )]
    password: String,

    /// The host to connect to
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "localhost", env = "HASH_GRAPH_PG_HOST")
    )]
    host: String,

    /// The port to connect to
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "5432", env = "HASH_GRAPH_PG_PORT")
    )]
    port: u16,

    /// The database name to use
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "graph", env = "HASH_GRAPH_PG_DATABASE")
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
pub trait Store = AccountStore
    + DataTypeStore
    + PropertyTypeStore
    + LinkTypeStore
    + EntityTypeStore
    + EntityStore
    + LinkStore;

/// Describes the API of a store implementation for accounts.
#[async_trait]
pub trait AccountStore {
    /// Inserts the specified [`AccountId`] into the database.
    ///
    /// # Errors
    ///
    /// - if insertion failed, e.g. because the [`AccountId`] already exists.
    async fn insert_account_id(&mut self, account_id: AccountId) -> Result<(), InsertionError>;
}

/// Describes the API of a store implementation for [`DataType`]s.
#[async_trait]
pub trait DataTypeStore: for<'q> crud::Read<PersistedDataType, Query<'q> = Expression> {
    /// Creates a new [`DataType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `data_type` already exist.
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError>;

    /// Get the [`DataType`]s specified by the [`Expression`].
    ///
    /// # Errors
    ///
    /// - if the requested [`DataType`] doesn't exist.
    async fn get_data_type(
        &self,
        query: &Expression,
    ) -> Result<Vec<PersistedDataType>, QueryError> {
        self.read(query).await
    }

    /// Update the definition of an existing [`DataType`].
    ///
    /// # Errors
    ///
    /// - if the [`DataType`] doesn't exist.
    async fn update_data_type(
        &mut self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError>;
}

/// Describes the API of a store implementation for [`PropertyType`]s.
#[async_trait]
pub trait PropertyTypeStore:
    for<'q> crud::Read<PersistedPropertyType, Query<'q> = Expression>
{
    /// Creates a new [`PropertyType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `property_type` already exists.
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn create_property_type(
        &mut self,
        property_type: PropertyType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError>;

    /// Get the [`PropertyType`]s specified by the [`Expression`].
    ///
    /// # Errors
    ///
    /// - if the requested [`PropertyType`] doesn't exist.
    async fn get_property_type(
        &self,
        query: &Expression,
    ) -> Result<Vec<PersistedPropertyType>, QueryError> {
        self.read(query).await
    }

    /// Update the definition of an existing [`PropertyType`].
    ///
    /// # Errors
    ///
    /// - if the [`PropertyType`] doesn't exist.
    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError>;
}

/// Describes the API of a store implementation for [`EntityType`]s.
#[async_trait]
pub trait EntityTypeStore: for<'q> crud::Read<PersistedEntityType, Query<'q> = Expression> {
    /// Creates a new [`EntityType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `entity_type` already exist.
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError>;

    /// Get the [`EntityType`]s specified by the [`Expression`].
    ///
    /// # Errors
    ///
    /// - if the requested [`EntityType`] doesn't exist.
    async fn get_entity_type(
        &self,
        query: &Expression,
    ) -> Result<Vec<PersistedEntityType>, QueryError> {
        self.read(query).await
    }

    /// Update the definition of an existing [`EntityType`].
    ///
    /// # Errors
    ///
    /// - if the [`EntityType`] doesn't exist.
    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError>;
}

/// Describes the API of a store implementation for [`LinkType`]s.
#[async_trait]
pub trait LinkTypeStore: for<'q> crud::Read<PersistedLinkType, Query<'q> = Expression> {
    /// Creates a new [`LinkType`].
    ///
    /// # Errors:
    ///
    /// - if the account referred to by `created_by` does not exist.
    /// - if the [`BaseUri`] of the `property_type` already exists.
    ///
    /// [`BaseUri`]: type_system::uri::BaseUri
    async fn create_link_type(
        &mut self,
        link_type: LinkType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError>;

    /// Get the [`LinkType`]s specified by the [`Expression`].
    ///
    /// # Errors
    ///
    /// - if the requested [`LinkType`] doesn't exist.
    async fn get_link_type(
        &self,
        query: &Expression,
    ) -> Result<Vec<PersistedLinkType>, QueryError> {
        self.read(query).await
    }

    /// Update the definition of an existing [`LinkType`].
    ///
    /// # Errors
    ///
    /// - if the [`LinkType`] doesn't exist.
    async fn update_link_type(
        &mut self,
        property_type: LinkType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError>;
}

/// Describes the API of a store implementation for Entities.
#[async_trait]
pub trait EntityStore: for<'q> crud::Read<PersistedEntity, Query<'q> = Expression> {
    /// Creates a new [`Entity`].
    ///
    /// # Errors:
    ///
    /// - if the [`EntityType`] doesn't exist
    /// - if the [`Entity`] is not valid with respect to the specified [`EntityType`]
    /// - if the account referred to by `created_by` does not exist
    async fn create_entity(
        &mut self,
        entity: Entity,
        entity_type_uri: VersionedUri,
        created_by: AccountId,
    ) -> Result<PersistedEntityIdentifier, InsertionError>;

    /// Get the [`PersistedEntity`] specified by the [`Expression`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Entity`] doesn't exist
    async fn get_entity(&self, query: &Expression) -> Result<Vec<PersistedEntity>, QueryError> {
        self.read(query).await
    }

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
        entity: Entity,
        entity_type_uri: VersionedUri,
        updated_by: AccountId,
    ) -> Result<PersistedEntityIdentifier, UpdateError>;
}

/// Describes the API of a store implementation for [`Link`]s.
#[async_trait]
pub trait LinkStore: for<'q> crud::Read<Link, Query<'q> = Expression> {
    /// Creates a new [`Link`].
    ///
    /// # Errors:
    ///
    /// - if the [`LinkType`] doesn't exist
    /// - if the [`Link`] already exists
    /// - if the account referred to by `created_by` does not exist
    async fn create_link(
        &mut self,
        link: &Link,
        created_by: AccountId,
    ) -> Result<(), InsertionError>;

    /// Get the [`Link`]s specified by the [`Expression`].
    ///
    /// # Errors
    ///
    /// - if the requested [`Link`]s don't exist.
    async fn get_links(&self, query: &Expression) -> Result<Vec<Link>, QueryError> {
        self.read(query).await
    }

    /// Inactivates a [`Link`] between a source and target [`Entity`].
    ///
    /// # Errors:
    ///
    /// - if the [`Link`] doesn't exist
    /// - if the account referred to by `created_by` does not exist
    async fn remove_link(
        &mut self,
        link: &Link,
        created_by: AccountId,
    ) -> Result<(), LinkActivationError>;
}
