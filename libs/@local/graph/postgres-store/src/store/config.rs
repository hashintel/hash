use core::{fmt, num::NonZero, pin::Pin};

use hash_crypto::Secret;
use tokio_postgres::Config;

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
            hide_env_values = true,
            global = true
        )
    )]
    password: Pin<Box<Secret<str>>>,

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
        password: Pin<Box<Secret<str>>>,
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

    /// The connection configuration, password included.
    ///
    /// The copy of the password in the returned [`Config`] is not zeroed when it is dropped.
    #[must_use]
    pub fn config(&self) -> Config {
        let mut config = Config::new();
        config
            .user(&self.user)
            .password(self.password.expose())
            .host(&self.host)
            .port(self.port)
            .dbname(&self.database);
        config
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
    pub fn password(&self) -> &Secret<str> {
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

#[cfg(test)]
mod tests {
    use hash_crypto::Secret;
    use tokio_postgres::config::Host;

    use super::{DatabaseConnectionInfo, DatabaseType};

    #[test]
    fn config_reserved_characters() {
        let info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            "graph".to_owned(),
            Secret::from_string("p@ss/w:rd".to_owned()),
            "db.example.com".to_owned(),
            5433,
            "hash".to_owned(),
        );

        let config = info.config();

        assert_eq!(config.get_user(), Some("graph"), "the user should be set");
        assert_eq!(
            config.get_password(),
            Some(b"p@ss/w:rd".as_slice()),
            "the password should be set without escaping"
        );
        assert_eq!(
            config.get_hosts(),
            [Host::Tcp("db.example.com".to_owned())],
            "the host should be set"
        );
        assert_eq!(config.get_ports(), [5433], "the port should be set");
        assert_eq!(
            config.get_dbname(),
            Some("hash"),
            "the database should be set"
        );
    }
}
