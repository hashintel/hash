use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_codec::bytes::{JsonLinesDecoder, JsonLinesEncoder};
use hash_graph_postgres_store::{
    snapshot::{SnapshotDumpSettings, SnapshotEntry, SnapshotStore},
    store::{DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, PostgresStoreSettings},
};
use hash_graph_store::pool::StorePool as _;
use tokio::io;
use tokio_postgres::NoTls;
use tokio_util::codec::{FramedRead, FramedWrite};

use crate::error::GraphError;

#[expect(
    clippy::struct_excessive_bools,
    reason = "This is a configuration struct"
)]
#[derive(Debug, Parser)]
pub struct SnapshotDumpArgs {
    /// Whether to skip dumping the principals.
    #[clap(long)]
    pub no_principals: bool,

    /// Whether to skip dumping the actions.
    #[clap(long)]
    pub no_actions: bool,

    /// Whether to skip dumping the policies.
    #[clap(long)]
    pub no_policies: bool,

    /// Whether to skip dumping the entities.
    #[clap(long)]
    pub no_entities: bool,

    /// Whether to skip dumping the entity types.
    #[clap(long)]
    pub no_entity_types: bool,

    /// Whether to skip dumping the property types.
    #[clap(long)]
    pub no_property_types: bool,

    /// Whether to skip dumping the data types.
    #[clap(long)]
    pub no_data_types: bool,

    /// Whether to skip dumping the embeddings.
    #[clap(long)]
    pub no_embeddings: bool,
}

#[derive(Debug, Parser)]
pub struct SnapshotRestoreArgs {
    /// Whether to skip the validation checks.
    #[clap(long)]
    pub skip_validation: bool,

    /// Whether to skip the validation checks.
    #[clap(long)]
    pub ignore_validation_errors: bool,
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
}

pub async fn snapshot(args: SnapshotArgs) -> Result<(), Report<GraphError>> {
    SnapshotEntry::install_error_stack_hook();

    let mut settings = PostgresStoreSettings::default();
    if let SnapshotCommand::Restore(args) = &args.command {
        settings.validate_links = !args.skip_validation;
    }

    let pool = PostgresStorePool::new(&args.db_info, &args.pool_config, NoTls, settings)
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to connect to database");
            report
        })?;

    match args.command {
        SnapshotCommand::Dump(args) => {
            let write = FramedWrite::new(
                io::BufWriter::new(io::stdout()),
                JsonLinesEncoder::default(),
            );
            let settings = SnapshotDumpSettings {
                chunk_size: 10_000,
                dump_principals: !args.no_principals,
                dump_actions: !args.no_actions,
                dump_policies: !args.no_policies,
                dump_entities: !args.no_entities,
                dump_entity_types: !args.no_entity_types,
                dump_property_types: !args.no_property_types,
                dump_data_types: !args.no_data_types,
                dump_embeddings: !args.no_embeddings,
            };

            pool.dump_snapshot(write, settings)
                .change_context(GraphError)
                .attach("Failed to produce snapshot dump")?;

            tracing::info!("Snapshot dumped successfully");
        }
        SnapshotCommand::Restore(args) => {
            let read =
                FramedRead::new(io::BufReader::new(io::stdin()), JsonLinesDecoder::default());
            SnapshotStore::new(
                pool.acquire(None)
                    .await
                    .change_context(GraphError)
                    .map_err(|report| {
                        tracing::error!(error = ?report, "Failed to acquire database connection");
                        report
                    })?,
            )
            .restore_snapshot(read, 10_000, args.ignore_validation_errors)
            .await
            .change_context(GraphError)
            .attach("Failed to restore snapshot")?;

            tracing::info!("Snapshot restored successfully");
        }
    }

    Ok(())
}
