mod completions;
mod run;

use core::{error::Error, pin::Pin};
use std::path::PathBuf;

use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use hash_graph_postgres_store::store::{self, DatabaseSslMode, DatabaseType};
use tokio_postgres::{Client, Connection, Socket, tls::MakeTlsConnect};
use tokio_postgres_rustls::MakeRustlsConnect;

use self::{completions::CompletionsCommand, run::RunCommand};
use crate::Command;

#[derive(Debug, clap::Subcommand)]
pub enum Subcommand {
    /// Generate a completion script for the given shell and outputs it to stdout.
    Completions(CompletionsCommand),
    /// Runs the migrations.
    Run(RunCommand),
}

impl Command for Subcommand {
    async fn execute(self) -> Result<(), Box<dyn Error>> {
        match self {
            Self::Completions(command) => command.execute().await,
            Self::Run(command) => command.execute().await,
        }
    }
}

#[derive(Debug, Clone, clap::Args)]
pub struct DatabaseConnectionInfo {
    /// Database username.
    #[clap(long, default_value = "postgres", env = "HASH_GRAPH_PG_USER")]
    user: String,

    /// Database password for authentication.
    #[clap(
        long,
        default_value = "postgres",
        env = "HASH_GRAPH_PG_PASSWORD",
        hide_env_values = true
    )]
    password: Pin<Box<Secret<str>>>,

    /// The host to connect to.
    #[clap(long, default_value = "localhost", env = "HASH_GRAPH_PG_HOST")]
    host: String,

    /// The port to connect to.
    #[clap(long, default_value = "5432", env = "HASH_GRAPH_PG_PORT")]
    port: u16,

    /// The database name to use.
    #[clap(long, default_value = "graph", env = "HASH_GRAPH_PG_DATABASE")]
    database: String,

    /// Whether to connect to the database over TLS.
    #[clap(
        long = "pg-ssl-mode",
        default_value = "disable",
        value_enum,
        env = "HASH_GRAPH_PG_SSL_MODE"
    )]
    ssl_mode: DatabaseSslMode,

    /// Path to the PEM-encoded root certificate the database server is verified against.
    ///
    /// Required unless `--pg-ssl-mode` is `disable`.
    #[clap(
        long = "pg-ssl-root-cert",
        env = "HASH_GRAPH_PG_SSL_ROOT_CERT",
        required_if_eq("ssl_mode", "verify-full")
    )]
    ssl_root_cert: Option<PathBuf>,
}

/// Connecting to the database failed.
#[derive(Debug, derive_more::Display)]
pub enum ConnectError {
    #[display("the root certificate could not be loaded")]
    RootCertificate,
    #[display("could not connect to the database")]
    Connect,
}

impl Error for ConnectError {}

type TlsStream = <MakeRustlsConnect as MakeTlsConnect<Socket>>::Stream;

impl DatabaseConnectionInfo {
    /// Connects to the database, over TLS if `--pg-ssl-mode` enables it.
    ///
    /// # Errors
    ///
    /// - [`RootCertificate`] if the root certificate cannot be loaded
    /// - [`Connect`] if the connection or handshake fails
    ///
    /// [`RootCertificate`]: ConnectError::RootCertificate
    /// [`Connect`]: ConnectError::Connect
    pub async fn connect(
        self,
    ) -> Result<(Client, Connection<Socket, TlsStream>), Report<ConnectError>> {
        let info = store::DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            self.user,
            self.password,
            self.host,
            self.port,
            self.database,
        )
        .with_ssl(self.ssl_mode, self.ssl_root_cert);
        let tls = info.tls().change_context(ConnectError::RootCertificate)?;

        info.config()
            .connect(tls)
            .await
            .change_context(ConnectError::Connect)
    }
}

#[cfg(test)]
mod tests {
    use clap::{Parser, error::ErrorKind};

    use super::DatabaseConnectionInfo;

    #[derive(Debug, Parser)]
    struct Cli {
        #[command(flatten)]
        info: DatabaseConnectionInfo,
    }

    #[test]
    fn ssl_requires_root_cert() {
        let error = Cli::try_parse_from(["migrations", "--pg-ssl-mode", "verify-full"])
            .expect_err("verify-full without a root certificate should be rejected");

        assert_eq!(
            error.kind(),
            ErrorKind::MissingRequiredArgument,
            "`verify-full` should require `--pg-ssl-root-cert`"
        );
    }

    #[test]
    fn ssl_with_root_cert() {
        Cli::try_parse_from([
            "migrations",
            "--pg-ssl-mode",
            "verify-full",
            "--pg-ssl-root-cert",
            "/etc/ssl/rds.pem",
        ])
        .expect("a TLS mode with a root certificate should parse");
    }
}
