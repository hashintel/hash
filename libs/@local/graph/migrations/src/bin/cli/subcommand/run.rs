use core::error::Error;

use clap::Parser;
use hash_graph_migrations::MigrationPlanBuilder;

use crate::{Command, subcommand::DatabaseConnectionInfo};

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct RunCommand {
    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    #[clap(long)]
    pub target: Option<u32>,
}

hash_graph_migrations::embed_migrations!("graph-migrations");

impl Command for RunCommand {
    async fn execute(self) -> Result<(), Box<dyn Error>> {
        let (client, connection) = self.db_info.connect().await?;

        tokio::spawn(async move {
            if let Err(error) = connection.await {
                tracing::error!(error = ?error, "Connection error");
            }
        });

        let mut builder = MigrationPlanBuilder::new()
            .state(client)
            .migrations(self::migrations());

        if let Some(target) = self.target {
            builder = builder.target(target);
        }

        builder.await?.execute().await?;
        Ok(())
    }
}
