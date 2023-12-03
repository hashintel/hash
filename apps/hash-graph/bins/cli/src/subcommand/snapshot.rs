use authorization::backend::{SpiceDbOpenApi, ZanzibarBackend};
use clap::Parser;
use error_stack::{Result, ResultExt};
use graph::{
    logging::{init_logger, LoggingArgs},
    snapshot::{SnapshotEntry, SnapshotStore},
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

    /// The host the Spice DB server is listening at.
    #[clap(long, env = "HASH_SPICEDB_HOST")]
    pub spicedb_host: String,

    /// The port the Spice DB server is listening at.
    #[clap(long, env = "HASH_SPICEDB_HTTP_PORT")]
    pub spicedb_http_port: u16,

    /// The secret key used to authenticate with the Spice DB server.
    #[clap(long, env = "HASH_SPICEDB_GRPC_PRESHARED_KEY")]
    pub spicedb_grpc_preshared_key: Option<String>,
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

    let mut authorization_api = SpiceDbOpenApi::new(
        format!("{}:{}", args.spicedb_host, args.spicedb_http_port),
        args.spicedb_grpc_preshared_key.as_deref(),
    )
    .change_context(GraphError)?;
    authorization_api
        .import_schema(include_str!(
            "../../../../../../libs/@local/hash-authorization/schemas/v1__initial_schema.zed"
        ))
        .await
        .change_context(GraphError)?;

    match args.command {
        SnapshotCommand::Dump(_) => {
            pool.dump_snapshot(
                FramedWrite::new(
                    io::BufWriter::new(io::stdout()),
                    codec::bytes::JsonLinesEncoder::default(),
                ),
                &authorization_api,
                10_000,
            )
            .change_context(GraphError)
            .attach_printable("Failed to produce snapshot dump")?;

            tracing::info!("Snapshot dumped successfully");
        }
        SnapshotCommand::Restore(_) => {
            SnapshotStore::new(pool.acquire().await.change_context(GraphError).map_err(
                |report| {
                    tracing::error!(error = ?report, "Failed to acquire database connection");
                    report
                },
            )?)
            .restore_snapshot(
                FramedRead::new(
                    io::BufReader::new(io::stdin()),
                    codec::bytes::JsonLinesDecoder::default(),
                ),
                &mut authorization_api,
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
