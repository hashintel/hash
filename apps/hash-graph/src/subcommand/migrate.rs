use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::PolicyStore as _;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, PostgresStoreSettings,
};
use hash_graph_store::{migration::StoreMigration as _, pool::StorePool as _};
use tokio_postgres::NoTls;

use crate::error::GraphError;

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct MigrateArgs {
    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,

    #[clap(flatten)]
    pub pool_config: DatabasePoolConfig,
}

#[tracing::instrument(level = "info", skip(args))]
pub async fn migrate(args: MigrateArgs) -> Result<(), Report<GraphError>> {
    let pool = PostgresStorePool::new(
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

    let mut store = pool
        .acquire(None)
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to acquire database connection");
            report
        })?;

    store
        .run_migrations()
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to run migrations");
            report
        })?;

    store
        .seed_system_policies()
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to seed system policies");
            report
        })?;

    Ok(())
}
