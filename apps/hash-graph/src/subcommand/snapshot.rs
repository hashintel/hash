use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_codec::bytes::{JsonLinesDecoder, JsonLinesEncoder};
use hash_graph_authorization::{
    AuthorizationApi as _, NoAuthorization,
    backend::{SpiceDbOpenApi, ZanzibarBackend as _},
    zanzibar::ZanzibarClient,
};
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

    /// Whether to skip dumping the relations.
    #[clap(long)]
    pub no_relations: bool,
}

#[derive(Debug, Parser)]
pub struct SnapshotRestoreArgs {
    /// Whether to skip the validation checks.
    #[clap(long)]
    pub skip_validation: bool,

    /// Whether to skip the validation checks.
    #[clap(long)]
    pub ignore_validation_errors: bool,

    /// Whether to skip the authorization restoring.
    #[clap(long)]
    pub skip_authorization: bool,
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

pub async fn snapshot(args: SnapshotArgs) -> Result<(), Report<GraphError>> {
    SnapshotEntry::install_error_stack_hook();

    let mut pool = PostgresStorePool::new(
        &args.db_info,
        &args.pool_config,
        NoTls,
        PostgresStoreSettings::default(),
    )
    .await
    .change_context(GraphError)
    .map_err(|report| {
        tracing::error!(error = ?report, "Failed to connect to database");
        report
    })?;

    let skip_authorization = match &args.command {
        SnapshotCommand::Dump(args) => args.no_relations,
        SnapshotCommand::Restore(args) => args.skip_authorization,
    };

    let authorization = if skip_authorization {
        None
    } else {
        let mut spicedb_client = SpiceDbOpenApi::new(
            format!("{}:{}", args.spicedb_host, args.spicedb_http_port),
            args.spicedb_grpc_preshared_key.as_deref(),
        )
        .change_context(GraphError)?;
        spicedb_client
            .import_schema(include_str!(
                "../../../../libs/@local/graph/authorization/schemas/v1__initial_schema.zed"
            ))
            .await
            .change_context(GraphError)?;

        let mut zanzibar_client = ZanzibarClient::new(spicedb_client);
        zanzibar_client.seed().await.change_context(GraphError)?;
        Some(zanzibar_client)
    };

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
                dump_relations: !args.no_relations,
            };

            if let Some(authorization) = authorization {
                pool.dump_snapshot(write, &authorization, settings)
            } else {
                pool.dump_snapshot(write, &NoAuthorization, settings)
            }
            .change_context(GraphError)
            .attach_printable("Failed to produce snapshot dump")?;

            tracing::info!("Snapshot dumped successfully");
        }
        SnapshotCommand::Restore(args) => {
            pool.settings.validate_links = !args.skip_validation;

            let read =
                FramedRead::new(io::BufReader::new(io::stdin()), JsonLinesDecoder::default());
            if let Some(authorization) = authorization {
                SnapshotStore::new(
                    pool.acquire(authorization, None)
                        .await
                        .change_context(GraphError)
                        .map_err(|report| {
                            tracing::error!(error = ?report, "Failed to acquire database connection");
                            report
                        })?,
                )
                    .restore_snapshot(read, 10_000, args.ignore_validation_errors)
                    .await
            } else {
                SnapshotStore::new(pool.acquire(NoAuthorization, None).await
                    .change_context(GraphError)
                    .map_err(|report| {
                        tracing::error!(error = ?report, "Failed to acquire database connection");
                        report
                    })?)
                    .restore_snapshot(read, 10_000, args.ignore_validation_errors)
                    .await
            }
            .change_context(GraphError)
            .attach_printable("Failed to restore snapshot")?;

            tracing::info!("Snapshot restored successfully");
        }
    }

    Ok(())
}
