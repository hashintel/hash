use core::error::Error;

use clap::Parser;
use hash_graph_migrations::MigrationPlanBuilder;

use crate::{Command, subcommand::DatabaseConnectionInfo};

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
#[expect(clippy::struct_excessive_bools, reason = "This is a CLI command")]
pub struct RunCommand {
    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    /// Run the migration up to the specified target.
    ///
    /// If the target is not specified, all migrations will be run. If the target is lower than the
    /// current migration, the migrations will be run in the down direction.
    #[clap(long)]
    pub target: Option<u32>,

    /// Allows the migration to run even if the files are divergent from the database.
    #[clap(long)]
    pub allow_divergent: bool,

    /// Divergent migrations will be updated in the database.
    #[clap(long, requires("allow_divergent"))]
    pub update_divergent: bool,

    /// Allows the migration to run even if the files are missing from the file system.
    #[clap(long)]
    pub allow_missing: bool,

    /// Missing migrations will be removed from the database.
    #[clap(long, requires("allow_missing"))]
    pub remove_missing: bool,
}

hash_graph_migrations::embed_migrations!("graph-migrations");

impl Command for RunCommand {
    async fn execute(self) -> Result<(), Box<dyn Error>> {
        let (state, state_connection) = self.db_info.clone().connect().await?;
        let (client, client_connection) = self.db_info.connect().await?;

        tokio::spawn(async move {
            if let Err(error) = state_connection.await {
                tracing::error!(error = ?error, "state connection error");
            }
        });
        tokio::spawn(async move {
            if let Err(error) = client_connection.await {
                tracing::error!(error = ?error, "client connection error");
            }
        });

        let mut builder = MigrationPlanBuilder::new()
            .state(state)
            .context(client)
            .migrations(self::migrations())
            .allow_divergent(self.allow_divergent)
            .update_divergent(self.update_divergent)
            .allow_missing(self.allow_missing)
            .remove_missing(self.remove_missing);

        if let Some(target) = self.target {
            builder = builder.target(target);
        }

        builder.await?.execute().await?;
        Ok(())
    }
}
