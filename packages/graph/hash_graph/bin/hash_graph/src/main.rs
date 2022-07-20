mod args;

use std::{fmt, net::SocketAddr};

use error_stack::{Context, FutureExt, Result};
use graph::{
    api::rest::rest_api_router, logging::init_logger, ontology::AccountId, store::PostgresDatabase,
};
use uuid::Uuid;

use crate::args::Args;

#[derive(Debug)]
pub struct GraphError;
impl Context for GraphError {}

impl fmt::Display for GraphError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("The Graph query layer encountered an error during execution")
    }
}

#[tokio::main]
async fn main() -> Result<(), GraphError> {
    let args = Args::parse();
    let _log_guard = init_logger(
        args.log_config.log_format,
        args.log_config.log_folder,
        args.log_config.log_level,
        &args.log_config.log_file_prefix,
    );

    let store = PostgresDatabase::new(&args.db_info)
        .change_context(GraphError)
        .await
        .map_err(|err| {
            tracing::error!("{err:?}");
            err
        })?;

    // TODO: Revisit, once authentication is in place
    let account_id = AccountId::new(Uuid::nil());

    if store
        .insert_account_id(account_id)
        .change_context(GraphError)
        .await
        .is_err()
    {
        tracing::info!(%account_id, "account id already exist");
    } else {
        tracing::info!(%account_id, "created account id");
    }

    let rest_router = rest_api_router(store);
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));

    tracing::info!("Listening on {addr}");
    axum::Server::bind(&addr)
        .serve(rest_router.into_make_service())
        .await
        .unwrap();

    Ok(())
}
