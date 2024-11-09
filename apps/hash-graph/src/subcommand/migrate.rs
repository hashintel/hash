use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::NoAuthorization;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool,
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

pub async fn migrate(args: MigrateArgs) -> Result<(), Report<GraphError>> {
    let pool = PostgresStorePool::new(&args.db_info, &args.pool_config, NoTls)
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to connect to database");
            report
        })?;

    pool.acquire(NoAuthorization, None)
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to acquire database connection");
            report
        })?
        .run_migrations()
        .await
        .change_context(GraphError)
        .map_err(|report| {
            tracing::error!(error = ?report, "Failed to run migrations");
            report
        })?;

    Ok(())
}
