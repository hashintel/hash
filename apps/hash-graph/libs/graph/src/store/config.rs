use core::{fmt, num::NonZero};

use derive_where::derive_where;

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum DatabaseType {
    #[default]
    Postgres,
}

#[derive(Clone, PartialEq, Eq)]
#[derive_where(Debug)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct DatabaseConnectionInfo {
    /// The database type to connect to.
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "postgres", value_enum, global = true)
    )]
    database_type: DatabaseType,

    /// Database username.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = "postgres",
            env = "HASH_GRAPH_PG_USER",
            global = true
        )
    )]
    user: String,

    /// Database password for authentication.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = "postgres",
            env = "HASH_GRAPH_PG_PASSWORD",
            global = true
        )
    )]
    #[derive_where(skip)]
    password: String,

    /// The host to connect to.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = "localhost",
            env = "HASH_GRAPH_PG_HOST",
            global = true
        )
    )]
    host: String,

    /// The port to connect to.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = "5432",
            env = "HASH_GRAPH_PG_PORT",
            global = true
        )
    )]
    port: u16,

    /// The database name to use.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value = "graph",
            env = "HASH_GRAPH_PG_DATABASE",
            global = true
        )
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

#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct DatabasePoolConfig {
    /// Sets the maximum number of connections managed by the pool.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value_t = Self::default().max_connections,
            env = "HASH_GRAPH_PG_MAX_CONNECTIONS",
            global = true
        )
    )]
    pub max_connections: NonZero<u32>,

    /// Sets the minimum idle connection count maintained by the pool.
    ///
    /// If set, the pool will try to maintain at least this many idle connections at all times,
    /// while respecting the value of `max_connections`.
    #[cfg_attr(
        feature = "clap",
        clap(long, env = "HASH_GRAPH_PG_MIN_IDLE_CONNECTIONS", global = true)
    )]
    pub min_idle_connections: Option<NonZero<u32>>,

    /// Sets the maximum lifetime of connections in the pool in seconds.
    ///
    /// If set, connections will be closed at the next reaping after surviving past this duration.
    ///
    /// If a connection reaches its maximum lifetime while checked out it will be closed when it is
    /// returned to the pool.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value_t = Self::default().max_connection_lifetime,
            env = "HASH_GRAPH_PG_MAX_CONNECTION_LIFETIME",
            global = true
        )
    )]
    pub max_connection_lifetime: NonZero<u64>,

    /// Sets the connection timeout used by the pool in seconds.
    ///
    /// Acquiring a connection will wait this long before giving up and returning an error.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value_t = Self::default().connection_timeout,
            env = "HASH_GRAPH_PG_CONNECTION_TIMEOUT",
            global = true
        )
    )]
    pub connection_timeout: NonZero<u64>,

    /// Sets the idle timeout used by the pool in seconds.
    ///
    /// If set, idle connections in excess of `min_idle_connections` will be closed at the next
    /// reaping after remaining idle past this duration.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            default_value_t = Self::default().connection_idle_timeout,
            env = "HASH_GRAPH_PG_CONNECTION_IDLE_TIMEOUT",
            global = true
        )
    )]
    pub connection_idle_timeout: NonZero<u64>,
}

impl Default for DatabasePoolConfig {
    #[expect(clippy::unwrap_used)]
    fn default() -> Self {
        Self {
            max_connections: NonZero::new(10).unwrap(),
            min_idle_connections: None,
            max_connection_lifetime: NonZero::new(30 * 60).unwrap(),
            connection_timeout: NonZero::new(30).unwrap(),
            connection_idle_timeout: NonZero::new(10 * 60).unwrap(),
        }
    }
}
