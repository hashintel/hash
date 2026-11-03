//! The store connection: flags and dialing.

use core::{error::Error, fmt, pin::Pin};
use std::{io, path::PathBuf};

use clap::Args;
use error_stack::Report;
use hash_crypto::Secret;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabaseSslMode, DatabaseType,
    postgres::connection::RootCertificateError,
};
use tokio::net::TcpStream;
use tokio_postgres::{Client, config::Host, tls::MakeTlsConnect};

/// The store connection flags, mirroring the graph binary's `HASH_GRAPH_PG_*` environment.
///
/// [`connect`](Self::connect) dials what the flags name. One deployment configuration drives the
/// graph binary and the standalone binary alike.
#[derive(Debug, Args)]
pub struct PostgresArgs {
    /// The store username.
    ///
    /// Defaults to `postgres` when neither the flag nor `HASH_GRAPH_PG_USER` supplies one.
    #[arg(long, default_value = "postgres", env = "HASH_GRAPH_PG_USER")]
    user: String,

    /// The store password.
    ///
    /// Defaults to `postgres` when neither the flag nor `HASH_GRAPH_PG_PASSWORD` supplies one.
    /// The environment value stays out of `--help`.
    #[arg(
        long,
        default_value = "postgres",
        env = "HASH_GRAPH_PG_PASSWORD",
        hide_env_values = true
    )]
    password: Pin<Box<Secret<str>>>,

    /// The store host.
    ///
    /// Defaults to `localhost` when neither the flag nor `HASH_GRAPH_PG_HOST` supplies one.
    #[arg(long, default_value = "localhost", env = "HASH_GRAPH_PG_HOST")]
    host: String,

    /// The store port.
    ///
    /// Defaults to `5432` when neither the flag nor `HASH_GRAPH_PG_PORT` supplies one.
    #[arg(long, default_value_t = 5432, env = "HASH_GRAPH_PG_PORT")]
    port: u16,

    /// The database name.
    ///
    /// Defaults to `graph` when neither the flag nor `HASH_GRAPH_PG_DATABASE` supplies one.
    #[arg(long, default_value = "graph", env = "HASH_GRAPH_PG_DATABASE")]
    database: String,

    /// Whether to connect to the store over TLS.
    ///
    /// Defaults to `disable` when neither the flag nor `HASH_GRAPH_PG_SSL_MODE` supplies one.
    #[arg(
        long = "pg-ssl-mode",
        default_value = "disable",
        value_enum,
        env = "HASH_GRAPH_PG_SSL_MODE"
    )]
    ssl_mode: DatabaseSslMode,

    /// The PEM-encoded root certificate the store is verified against.
    ///
    /// Required unless `--pg-ssl-mode` is `disable`.
    #[arg(
        long = "pg-ssl-root-cert",
        env = "HASH_GRAPH_PG_SSL_ROOT_CERT",
        required_if_eq_any = [("ssl_mode", "prefer"), ("ssl_mode", "require")]
    )]
    ssl_root_cert: Option<PathBuf>,
}

impl PostgresArgs {
    /// Dials the store the flags name and drives the connection on a background task.
    ///
    /// The flags configure the connection field by field, so a password containing URL-reserved
    /// characters needs no escaping.
    ///
    /// # Errors
    ///
    /// Returns a [`ConnectError`] when the root certificate cannot be loaded, when the host flag
    /// names no TCP host, or when the store refuses the connection or handshake.
    pub async fn connect(self) -> Result<Client, ConnectError> {
        let info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            self.user,
            self.password,
            self.host,
            self.port,
            self.database,
        )
        .with_ssl(self.ssl_mode, self.ssl_root_cert);

        connect(&info).await
    }
}

/// Dialing the store failed.
#[derive(Debug)]
pub enum ConnectError {
    /// The root certificate could not be loaded.
    RootCertificate(Report<RootCertificateError>),
    /// The configuration names no TCP host.
    NoTcpHost,
    /// The store refused the TCP connection.
    Connect(io::Error),
    /// The store handshake failed.
    Handshake(tokio_postgres::Error),
}

impl fmt::Display for ConnectError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::RootCertificate(_) => fmt.write_str("the root certificate could not be loaded"),
            Self::NoTcpHost => fmt.write_str("the configuration names no TCP host"),
            Self::Connect(_) => fmt.write_str("the store refused the TCP connection"),
            Self::Handshake(_) => fmt.write_str("the store handshake failed"),
        }
    }
}

impl Error for ConnectError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::RootCertificate(report) => Some(report.as_error()),
            Self::Handshake(error) => Some(error),
            Self::NoTcpHost => None,
            Self::Connect(error) => Some(error),
        }
    }
}

/// Dials the store `info` names, over TLS if `info` enables it, and drives the connection on a
/// background task.
///
/// # Errors
///
/// Returns a [`ConnectError`] when the root certificate cannot be loaded, when `info` names no TCP
/// host, when the socket refuses the connection, or when the store rejects the handshake.
pub async fn connect(info: &DatabaseConnectionInfo) -> Result<Client, ConnectError> {
    let mut tls = info.tls().map_err(ConnectError::RootCertificate)?;
    let config = info.config();
    let host = config
        .get_hosts()
        .iter()
        .find_map(|host| match host {
            Host::Tcp(name) => Some(name.clone()),
            #[cfg(unix)]
            Host::Unix(_) => None,
        })
        .ok_or(ConnectError::NoTcpHost)?;
    // 5432 is the protocol's registered port, which tokio-postgres also dials when no port is set.
    let port = config.get_ports().first().copied().unwrap_or(5432);

    let stream = TcpStream::connect((host.as_str(), port))
        .await
        .map_err(ConnectError::Connect)?;
    let Ok(tls) = MakeTlsConnect::<TcpStream>::make_tls_connect(&mut tls, &host);
    let (client, connection) = config
        .connect_raw(stream, tls)
        .await
        .map_err(ConnectError::Handshake)?;
    tokio::spawn(async move {
        if let Err(error) = connection.await {
            tracing::error!(%error, "the store connection failed");
        }
    });

    Ok(client)
}

#[cfg(test)]
mod tests {
    use clap::{Parser, error::ErrorKind};

    use super::PostgresArgs;

    #[derive(Debug, Parser)]
    struct Cli {
        #[command(flatten)]
        store: PostgresArgs,
    }

    #[test]
    fn ssl_requires_root_cert() {
        for mode in ["prefer", "require"] {
            let error = Cli::try_parse_from(["atlas", "--pg-ssl-mode", mode])
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
        Cli::try_parse_from([
            "atlas",
            "--pg-ssl-mode",
            "require",
            "--pg-ssl-root-cert",
            "/etc/ssl/rds.pem",
        ])
        .expect("a TLS mode with a root certificate should parse");
    }
}
