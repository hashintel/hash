use core::fmt;

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum DatabaseType {
    #[default]
    Postgres,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct DatabaseConnectionInfo {
    /// The database type to connect to.
    #[cfg_attr(feature = "clap", clap(long, default_value = "postgres", value_enum))]
    database_type: DatabaseType,

    /// Database username.
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "postgres", env = "HASH_GRAPH_PG_USER")
    )]
    user: String,

    /// Database password for authentication.
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "postgres", env = "HASH_GRAPH_PG_PASSWORD")
    )]
    password: String,

    /// The host to connect to.
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "localhost", env = "HASH_GRAPH_PG_HOST")
    )]
    host: String,

    /// The port to connect to.
    #[cfg_attr(
        feature = "clap",
        clap(long, default_value = "5432", env = "HASH_GRAPH_PG_PORT")
    )]
    port: u16,

    /// The database name to use.
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
