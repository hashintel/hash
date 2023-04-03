use std::io::{self, BufRead, BufReader, BufWriter, Write};

use clap::Parser;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{SinkExt, StreamExt};
use graph::{
    logging::{init_logger, LoggingArgs},
    snapshot::{SnapshotEntry, SnapshotStore},
    store::{DatabaseConnectionInfo, PostgresStorePool, StorePool},
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

    let mut store = SnapshotStore::new(
        pool.acquire_owned()
            .await
            .change_context(GraphError)
            .map_err(|report| {
                tracing::error!(error = ?report, "Failed to acquire database connection");
                report
            })?,
    );

    // TODO: Use a thin wrapper around serde-json which implements `Sink` and `Stream` to avoid the
    //       need for a separate thread.
    let (sender, mut receiver) = futures::channel::mpsc::channel::<SnapshotEntry>(8);
    let mut sender = sender.sink_map_err(Report::new);

    match args.command {
        SnapshotCommand::Dump(_) => {
            let reader = tokio::spawn(async move { store.dump_snapshot(sender).await });

            let mut stdout = BufWriter::new(io::stdout());
            while let Some(entry) = receiver.next().await {
                serde_json::to_writer(&mut stdout, &entry)
                    .into_report()
                    .change_context(GraphError)?;
                stdout
                    .write(&[b'\n'])
                    .into_report()
                    .change_context(GraphError)?;
            }

            reader
                .await
                .into_report()
                .change_context(GraphError)?
                .change_context(GraphError)?;

            tracing::info!("Snapshot dumped successfully");
        }
        SnapshotCommand::Restore(_) => {
            let writer = tokio::spawn(async move { store.restore_snapshot(receiver).await });

            for line in BufReader::new(io::stdin()).lines() {
                let entry: SnapshotEntry =
                    serde_json::from_str(&line.into_report().change_context(GraphError)?)
                        .into_report()
                        .change_context(GraphError)?;

                sender.send(entry).await.change_context(GraphError)?;
            }

            // Close the channel to signal the writer that we are done.
            sender.close().await.change_context(GraphError)?;

            writer
                .await
                .into_report()
                .change_context(GraphError)?
                .change_context(GraphError)?;

            tracing::info!("Snapshot restored successfully");
        }
    }

    Ok(())
}
