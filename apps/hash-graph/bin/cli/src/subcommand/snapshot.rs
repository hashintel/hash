use clap::Parser;
use error_stack::{Result, ResultExt};
use graph::{
    logging::{init_logger, LoggingArgs},
    snapshot::{codec, SnapshotEntry, SnapshotStore},
    store::{DatabaseConnectionInfo, PostgresStorePool, StorePool},
};
use tokio::io;
use tokio_postgres::NoTls;
use tokio_util::codec::{FramedRead, FramedWrite};

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
    SnapshotEntry::install_error_stack_hook();

    let pool = PostgresStorePool::new(&args.db_info, NoTls)
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to connect to database");
            report
        })?;

    let mut store = SnapshotStore::new(pool.acquire().await.change_context(GraphError).map_err(
        |report| {
            tracing::error!(error = ?report, "Failed to acquire database connection");
            report
        },
    )?);

    match args.command {
        SnapshotCommand::Dump(_) => {
            store
                .dump_snapshot(FramedWrite::new(
                    io::BufWriter::new(io::stdout()),
                    codec::JsonLinesEncoder::default(),
                ))
                .await
                .change_context(GraphError)
                .attach_printable("Failed to produce snapshot dump")?;

            tracing::info!("Snapshot dumped successfully");
        }
        SnapshotCommand::Restore(_) => {
            store
                .restore_snapshot(
                    FramedRead::new(
                        io::BufReader::new(io::stdin()),
                        codec::JsonLinesDecoder::default(),
                    ),
                    10_000,
                )
                .await
                .change_context(GraphError)
                .attach_printable("Failed to restore snapshot")?;

            tracing::info!("Snapshot restored successfully");
        }
    }

    Ok(())
}
