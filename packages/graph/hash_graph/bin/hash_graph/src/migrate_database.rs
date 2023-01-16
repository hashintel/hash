use error_stack::{Result, ResultExt};
use graph::{
    logging::init_logger,
    store::{PostgresStorePool, StoreMigration, StorePool},
};
use tokio_postgres::NoTls;

use crate::{args::MirgrateArgs, error::GraphError};

pub async fn migrate_database(args: MirgrateArgs) -> Result<(), GraphError> {
    let log_args = args.log_config.clone();
    let _log_guard = init_logger(
        log_args.log_format,
        log_args.log_folder,
        log_args.log_level,
        &log_args.log_file_prefix,
        args.log_config.otlp_endpoint.as_deref(),
    );

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
