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
    #[expect(clippy::missing_const_for_fn, reason = "false positive")]
    pub fn user(&self) -> &str {
        &self.user
    }

    /// Returns the password in plain text.
    ///
    /// Note, that this will reveal the password, so the returned output should not be printed.
    #[must_use]
    #[expect(clippy::missing_const_for_fn, reason = "false positive")]
    pub fn password(&self) -> &str {
        &self.password
    }

    #[must_use]
    #[expect(clippy::missing_const_for_fn, reason = "false positive")]
    pub fn host(&self) -> &str {
        &self.host
    }

    #[must_use]
    pub const fn port(&self) -> u16 {
        self.port
    }

    #[must_use]
    #[expect(clippy::missing_const_for_fn, reason = "false positive")]
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
    pub max_connections: NonZero<usize>,
}

impl Default for DatabasePoolConfig {
    #[expect(clippy::unwrap_used)]
    fn default() -> Self {
        Self {
            max_connections: NonZero::new(10).unwrap(),
        }
    }
}
