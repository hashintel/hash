use std::fmt;

use error_stack::{Context, Result};
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
    let connect_url = "postgres://postgres:postgres@localhost/postgres"; // TODO - stop hardcoding
    let _datastore = PostgresDatabase::new(connect_url).await;

    Ok(())
}
