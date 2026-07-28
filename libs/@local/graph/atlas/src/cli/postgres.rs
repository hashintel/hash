//! The store connection: flags and dialing.

use core::{error::Error, fmt};
use std::io;

use clap::Args;
use tokio_postgres::{Client, Config, NoTls, config::Host};

/// The store connection flags, mirroring the graph binary's `HASH_GRAPH_PG_*` environment.
///
/// [`connect`](Self::connect) dials what the flags name; one deployment configuration drives the
/// graph binary and the standalone binary alike.
#[derive(Debug, Args)]
pub struct PostgresArgs {
    /// The store username.
    #[arg(long, default_value = "postgres", env = "HASH_GRAPH_PG_USER")]
    user: String,

    /// The store password.
    #[arg(
        long,
        default_value = "postgres",
        env = "HASH_GRAPH_PG_PASSWORD",
        hide_env_values = true
    )]
    password: String,

    /// The store host.
    #[arg(long, default_value = "localhost", env = "HASH_GRAPH_PG_HOST")]
    host: String,

    /// The store port.
    #[arg(long, default_value_t = 5432, env = "HASH_GRAPH_PG_PORT")]
    port: u16,

    /// The database name.
    #[arg(long, default_value = "graph", env = "HASH_GRAPH_PG_DATABASE")]
    database: String,
}

impl PostgresArgs {
    /// Renders the store connection string.
    ///
    /// The password rides the returned string, so it must not be logged or printed.
    fn dsn(&self) -> String {
        format!(
            "postgres://{}:{}@{}:{}/{}",
            self.user, self.password, self.host, self.port, self.database
        )
    }

    /// Dials the store the flags name and drives the connection on a background task.
    ///
    /// # Errors
    ///
    /// Returns a [`ConnectError`] when the store refuses the connection or handshake.
    pub async fn connect(&self) -> Result<Client, ConnectError> {
        connect(&self.dsn()).await
    }
}

/// The store could not be dialed.
#[derive(Debug)]
pub enum ConnectError {
    /// The connection string did not parse.
    Parse(tokio_postgres::Error),
    /// The connection string names no TCP host.
    NoTcpHost,
    /// The store refused the TCP connection.
    Connect(io::Error),
    /// The store handshake failed.
    Handshake(tokio_postgres::Error),
}

impl fmt::Display for ConnectError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Parse(_) => fmt.write_str("the connection string did not parse"),
            Self::NoTcpHost => fmt.write_str("the connection string names no TCP host"),
            Self::Connect(_) => fmt.write_str("the store refused the TCP connection"),
            Self::Handshake(_) => fmt.write_str("the store handshake failed"),
        }
    }
}

impl Error for ConnectError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Parse(error) | Self::Handshake(error) => Some(error),
            Self::NoTcpHost => None,
            Self::Connect(error) => Some(error),
        }
    }
}

/// Dials the store named by the connection string and drives the connection on a background task.
///
/// # Errors
///
/// Returns a [`ConnectError`] when the connection string does not parse or names no TCP host, or
/// when the store refuses the connection or handshake.
pub async fn connect(dsn: &str) -> Result<Client, ConnectError> {
    let config: Config = dsn.parse().map_err(ConnectError::Parse)?;
    let host = config
        .get_hosts()
        .iter()
        .find_map(|host| match host {
            Host::Tcp(name) => Some(name.clone()),
            #[cfg(unix)]
            Host::Unix(_) => None,
        })
        .ok_or(ConnectError::NoTcpHost)?;
    // 5432 is the protocol's registered port, the same default the
    // connection-string parser applies.
    let port = config.get_ports().first().copied().unwrap_or(5432);

    let stream = tokio::net::TcpStream::connect((host.as_str(), port))
        .await
        .map_err(ConnectError::Connect)?;
    let (client, connection) = config
        .connect_raw(stream, NoTls)
        .await
        .map_err(ConnectError::Handshake)?;
    tokio::spawn(async move {
        if let Err(error) = connection.await {
            tracing::error!(%error, "the store connection failed");
        }
    });

    Ok(client)
}
