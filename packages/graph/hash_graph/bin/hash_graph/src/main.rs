use std::fmt;

use error_stack::{Context, FutureExt, Result};
use graph::datastore::PostgresDatabase;

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
    // TODO: stop hardcoding the connection parameters
    let _datastore = PostgresDatabase::new("postgres", "postgres", "localhost", 5432, "graph")
        .change_context(GraphError)
        .await?;

    Ok(())
}
