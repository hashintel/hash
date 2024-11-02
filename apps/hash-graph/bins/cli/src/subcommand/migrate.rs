use authorization::NoAuthorization;
use clap::Parser;
use error_stack::{Result, ResultExt as _};
use graph::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, PostgresStorePool, StoreMigration as _,
    StorePool as _,
};
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

pub async fn migrate(args: MigrateArgs) -> Result<(), GraphError> {
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
