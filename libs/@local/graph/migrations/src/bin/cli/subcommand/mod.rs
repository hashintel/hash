mod completions;
mod run;

use core::error::Error;

use error_stack::Report;
use tokio_postgres::{Client, Config, Connection, NoTls, Socket, tls::NoTlsStream};

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

#[derive(derive_more::Debug, Clone, clap::Args)]
pub struct DatabaseConnectionInfo {
    /// Database username.
    #[clap(long, default_value = "postgres", env = "HASH_GRAPH_PG_USER")]
    user: String,

    /// Database password for authentication.
    #[clap(long, default_value = "postgres", env = "HASH_GRAPH_PG_PASSWORD")]
    #[debug("***")]
    password: String,

    /// The host to connect to.
    #[clap(long, default_value = "localhost", env = "HASH_GRAPH_PG_HOST")]
    host: String,

    /// The port to connect to.
    #[clap(long, default_value = "5432", env = "HASH_GRAPH_PG_PORT")]
    port: u16,

    /// The database name to use.
    #[clap(long, default_value = "graph", env = "HASH_GRAPH_PG_DATABASE")]
    database: String,
}

impl DatabaseConnectionInfo {
    pub async fn connect(
        self,
    ) -> Result<(Client, Connection<Socket, NoTlsStream>), Report<tokio_postgres::Error>> {
        Config::default()
            .user(self.user)
            .password(self.password)
            .host(self.host)
            .port(self.port)
            .dbname(self.database)
            .connect(NoTls)
            .await
            .map_err(Report::new)
    }
}
