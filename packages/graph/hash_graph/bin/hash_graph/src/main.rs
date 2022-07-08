mod args;

use std::{fmt, net::SocketAddr};

use error_stack::{Context, FutureExt, Result};
use graph::{api::rest::rest_api_router, datastore::PostgresDatabase};

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
    let datastore = PostgresDatabase::new(&args.db_info)
        .change_context(GraphError)
        .await?;

    let rest_router = rest_api_router(datastore);
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));

    // TODO: replace with tracing info
    println!("Listening on {addr}");
    axum::Server::bind(&addr)
        .serve(rest_router.into_make_service())
        .await
        .unwrap();

    Ok(())
}
