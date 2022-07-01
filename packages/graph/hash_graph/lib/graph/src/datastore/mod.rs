mod postgres;

use std::fmt;

use async_trait::async_trait;
use error_stack::{Context, Result};
pub use postgres::PostgresDatabase;

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
    /// Note, that this will reveal the password, so output should not be printed. The [`Display`]
    /// implementation should be used instead, which will mask the password.
    ///
    /// [`Display`]: core::fmt::Display.
    #[must_use]
    fn url(&self) -> String {
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

/// Describes the API of a Datastore implementation
#[async_trait]
trait Datastore {
    async fn create_data_type() -> Result<(), DatastoreError>;

    async fn get_data_type() -> Result<(), DatastoreError>;

    async fn get_data_many() -> Result<(), DatastoreError>;

    async fn update_data_type() -> Result<(), DatastoreError>;

    async fn create_property_type() -> Result<(), DatastoreError>;

    async fn get_property_type() -> Result<(), DatastoreError>;

    async fn get_property_many() -> Result<(), DatastoreError>;

    async fn update_property_type() -> Result<(), DatastoreError>;

    async fn create_entity_type() -> Result<(), DatastoreError>;

    async fn get_entity_type() -> Result<(), DatastoreError>;

    async fn get_entity_type_many() -> Result<(), DatastoreError>;

    async fn update_entity_type() -> Result<(), DatastoreError>;

    // TODO - perhaps we want to separate the Datastore into the Type Graph and the Data Graph

    async fn create_entity() -> Result<(), DatastoreError>;

    async fn get_entity() -> Result<(), DatastoreError>;

    async fn get_entity_many() -> Result<(), DatastoreError>;

    async fn update_entity() -> Result<(), DatastoreError>;
}
