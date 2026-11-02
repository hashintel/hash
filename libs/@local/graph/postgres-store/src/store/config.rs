use core::{fmt, num::NonZero, pin::Pin};
use std::path::PathBuf;

use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use rustls::RootCertStore;
use tokio_postgres::{Config, config::SslMode};
use tokio_postgres_rustls::MakeRustlsConnect;

use crate::store::postgres::connection::{RootCertificateError, connector, load_root_certificates};

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum DatabaseType {
    #[default]
    Postgres,
}

#[derive(Debug, Default, Copy, Clone, PartialEq, Eq)]
#[cfg_attr(feature = "clap", derive(clap::ValueEnum))]
pub enum DatabaseSslMode {
    /// Connect without TLS.
    #[default]
    Disable,
    /// Connect with TLS if the server supports it, otherwise without.
    Prefer,
    /// Connect with TLS and fail if the server does not support it.
    Require,
}

impl From<DatabaseSslMode> for SslMode {
    fn from(mode: DatabaseSslMode) -> Self {
        match mode {
            DatabaseSslMode::Disable => Self::Disable,
            DatabaseSslMode::Prefer => Self::Prefer,
            DatabaseSslMode::Require => Self::Require,
        }
    }
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

    /// Whether to connect to the database over TLS.
    #[cfg_attr(
        feature = "clap",
        clap(
            long = "pg-ssl-mode",
            default_value = "disable",
            value_enum,
            env = "HASH_GRAPH_PG_SSL_MODE",
            global = true
        )
    )]
    ssl_mode: DatabaseSslMode,

    /// Path to the PEM-encoded root certificate the database server is verified against.
    ///
    /// Required unless `--pg-ssl-mode` is `disable`.
    #[cfg_attr(
        feature = "clap",
        clap(
            long = "pg-ssl-root-cert",
            env = "HASH_GRAPH_PG_SSL_ROOT_CERT",
            required_if_eq_any = [("ssl_mode", "prefer"), ("ssl_mode", "require")],
            global = true
        )
    )]
    ssl_root_cert: Option<PathBuf>,
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
            ssl_mode: DatabaseSslMode::Disable,
            ssl_root_cert: None,
        }
    }

    /// Connects in the given SSL `mode`, verifying the server against `root_cert`.
    #[must_use]
    pub fn with_ssl(mut self, mode: DatabaseSslMode, root_cert: Option<PathBuf>) -> Self {
        self.ssl_mode = mode;
        self.ssl_root_cert = root_cert;
        self
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
            .dbname(&self.database)
            .ssl_mode(SslMode::from(self.ssl_mode));
        config
    }

    /// The TLS connector to connect with, using the [`config`](Self::config).
    ///
    /// # Errors
    ///
    /// Returns [`RootCertificateError`] if TLS is enabled and the root certificate is missing or
    /// cannot be loaded.
    pub fn tls(&self) -> Result<MakeRustlsConnect, Report<RootCertificateError>> {
        match (self.ssl_mode, &self.ssl_root_cert) {
            // `config` sets `SslMode::Disable`, so tokio-postgres never uses the connector.
            (DatabaseSslMode::Disable, _) => Ok(connector(RootCertStore::empty())),
            (DatabaseSslMode::Prefer | DatabaseSslMode::Require, Some(path)) => {
                load_root_certificates(path)
                    .map(connector)
                    .attach_with(|| path.display().to_string())
            }
            (DatabaseSslMode::Prefer | DatabaseSslMode::Require, None) => {
                Err(Report::new(RootCertificateError).attach("TLS is enabled without one"))
            }
        }
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

    use super::{DatabaseConnectionInfo, DatabaseSslMode, DatabaseType};

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

    fn local_info(ssl_mode: DatabaseSslMode) -> DatabaseConnectionInfo {
        DatabaseConnectionInfo {
            ssl_mode,
            ..DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                "graph".to_owned(),
                Secret::from_string("graph".to_owned()),
                "localhost".to_owned(),
                5432,
                "graph".to_owned(),
            )
        }
    }

    #[test]
    fn tls_disabled_without_root_cert() {
        assert!(
            local_info(DatabaseSslMode::Disable).tls().is_ok(),
            "disabled TLS should not need a root certificate"
        );
    }

    #[test]
    fn tls_enabled_without_root_cert() {
        for mode in [DatabaseSslMode::Prefer, DatabaseSslMode::Require] {
            assert!(
                local_info(mode).tls().is_err(),
                "{mode:?} should require a root certificate"
            );
        }
    }

    #[cfg(feature = "clap")]
    mod cli {
        use std::path::Path;

        use clap::{Parser, error::ErrorKind};
        use tokio_postgres::config::SslMode;

        use super::super::DatabaseConnectionInfo;

        #[derive(Debug, Parser)]
        struct Cli {
            #[clap(flatten)]
            info: DatabaseConnectionInfo,
        }

        #[test]
        fn ssl_disabled_by_default() {
            let cli = Cli::try_parse_from(["graph"]).expect("no arguments should parse");

            assert_eq!(cli.info.config().get_ssl_mode(), SslMode::Disable);
            assert_eq!(cli.info.ssl_root_cert, None);
        }

        #[test]
        fn ssl_requires_root_cert() {
            for mode in ["prefer", "require"] {
                let error = Cli::try_parse_from(["graph", "--pg-ssl-mode", mode])
                    .expect_err("a TLS mode without a root certificate should be rejected");

                assert_eq!(
                    error.kind(),
                    ErrorKind::MissingRequiredArgument,
                    "`{mode}` should require `--pg-ssl-root-cert`"
                );
            }
        }

        #[test]
        fn ssl_with_root_cert() {
            let cli = Cli::try_parse_from([
                "graph",
                "--pg-ssl-mode",
                "require",
                "--pg-ssl-root-cert",
                "/etc/ssl/rds.pem",
            ])
            .expect("a TLS mode with a root certificate should parse");

            assert_eq!(cli.info.config().get_ssl_mode(), SslMode::Require);
            assert_eq!(
                cli.info.ssl_root_cert.as_deref(),
                Some(Path::new("/etc/ssl/rds.pem"))
            );
        }
    }
}
