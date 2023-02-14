use clap::Parser;
use error_stack::{Result, ResultExt};
use graph::{
    logging::{init_logger, LoggingArgs},
    store::{DatabaseConnectionInfo, PostgresStorePool, StoreMigration, StorePool},
};
use tokio_postgres::NoTls;

use crate::error::GraphError;

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub struct MigrateArgs {
    #[clap(flatten)]
    pub log_config: LoggingArgs,

    #[clap(flatten)]
    pub db_info: DatabaseConnectionInfo,
}

pub async fn migrate(args: MigrateArgs) -> Result<(), GraphError> {
    let _log_guard = init_logger(&args.log_config);

    let pool = PostgresStorePool::new(&args.db_info, NoTls)
        .await
        .change_context(GraphError)
        .map_err(|err| {
            tracing::error!("{err:?}");
            err
        })?;

    let mut connection = pool
        .acquire()
        .await
        .change_context(GraphError)
        .map_err(|err| {
            tracing::error!("{err:?}");
            err
        })?;

    connection
        .run_migrations()
        .await
        .change_context(GraphError)
        .map_err(|err| {
            tracing::error!("{err:?}");
            err
        })?;

    Ok(())
}
