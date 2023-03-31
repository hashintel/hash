use std::io::Write;

use clap::Parser;
use error_stack::{IntoReport, Result, ResultExt};
use graph::{
    logging::{init_logger, LoggingArgs},
    store::{
        test_graph::{self, TestStore},
        DatabaseConnectionInfo, PostgresStorePool, StorePool,
    },
};
use tokio_postgres::NoTls;

use crate::error::GraphError;

#[derive(Debug, Parser)]
pub struct SnapshotDumpArgs;

#[derive(Debug, Parser)]
pub struct SnapshotRestoreArgs;

#[derive(Debug, Parser)]
pub enum SnapshotCommand {
    Dump(SnapshotDumpArgs),
    Restore(SnapshotRestoreArgs),
}

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct SnapshotArgs {
    #[command(subcommand)]
    pub command: SnapshotCommand,

    #[clap(flatten)]
    pub log_config: LoggingArgs,

    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,
}

pub async fn snapshot(args: SnapshotArgs) -> Result<(), GraphError> {
    let _log_guard = init_logger(&args.log_config);

    let pool = PostgresStorePool::new(&args.db_info, NoTls)
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to connect to database");
            report
        })?;

    let mut store = pool
        .acquire()
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to acquire database connection");
            report
        })?;

    match args.command {
        SnapshotCommand::Dump(_) => {
            serde_json::to_writer(
                &mut std::io::stdout(),
                &store.read_test_graph().await.change_context(GraphError)?,
            )
            .into_report()
            .change_context(GraphError)?;
            writeln!(std::io::stdout())
                .into_report()
                .change_context(GraphError)?;
        }
        SnapshotCommand::Restore(_) => {
            let snapshot: test_graph::TestData = serde_json::from_reader(std::io::stdin())
                .into_report()
                .change_context(GraphError)?;

            store
                .write_test_graph(snapshot)
                .await
                .change_context(GraphError)?;
        }
    }

    Ok(())
}
