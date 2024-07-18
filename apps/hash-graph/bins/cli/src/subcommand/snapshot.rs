use authorization::{
    backend::{SpiceDbOpenApi, ZanzibarBackend},
    zanzibar::ZanzibarClient,
    AuthorizationApi,
};
use clap::Parser;
use error_stack::{Result, ResultExt};
use graph::{
    snapshot::{SnapshotEntry, SnapshotStore},
    store::{DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, StorePool},
};
use tokio::io;
use tokio_postgres::NoTls;
use tokio_util::codec::{FramedRead, FramedWrite};

use crate::error::GraphError;

#[derive(Debug, Parser)]
pub struct SnapshotDumpArgs;

#[derive(Debug, Parser)]
pub struct SnapshotRestoreArgs {
    /// Whether to skip the validation checks.
    #[clap(long)]
    pub skip_validation: bool,
}

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
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub pool_config: DatabasePoolConfig,

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
    SnapshotEntry::install_error_stack_hook();

    let pool = PostgresStorePool::new(&args.db_info, &args.pool_config, NoTls)
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to connect to database");
            report
        })?;

    let mut spicedb_client = SpiceDbOpenApi::new(
        format!("{}:{}", args.spicedb_host, args.spicedb_http_port),
        args.spicedb_grpc_preshared_key.as_deref(),
    )
    .change_context(GraphError)?;
    spicedb_client
        .import_schema(include_str!(
            "../../../../../../libs/@local/hash-authorization/schemas/v1__initial_schema.zed"
        ))
        .await
        .change_context(GraphError)?;

    let mut zanzibar_client = ZanzibarClient::new(spicedb_client);
    zanzibar_client.seed().await.change_context(GraphError)?;

    match args.command {
        SnapshotCommand::Dump(_) => {
            pool.dump_snapshot(
                FramedWrite::new(
                    io::BufWriter::new(io::stdout()),
                    codec::bytes::JsonLinesEncoder::default(),
                ),
                &zanzibar_client,
                10_000,
            )
            .change_context(GraphError)
            .attach_printable("Failed to produce snapshot dump")?;

            tracing::info!("Snapshot dumped successfully");
        }
        SnapshotCommand::Restore(args) => {
            SnapshotStore::new(
                pool.acquire(zanzibar_client, None)
                    .await
                    .change_context(GraphError)
                    .map_err(|report| {
                        tracing::error!(error = ?report, "Failed to acquire database connection");
                        report
                    })?,
            )
            .restore_snapshot(
                FramedRead::new(
                    io::BufReader::new(io::stdin()),
                    codec::bytes::JsonLinesDecoder::default(),
                ),
                10_000,
                !args.skip_validation,
            )
            .await
            .change_context(GraphError)
            .attach_printable("Failed to restore snapshot")?;

            tracing::info!("Snapshot restored successfully");
        }
    }

    Ok(())
}
