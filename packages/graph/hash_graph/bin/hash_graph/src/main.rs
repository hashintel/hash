mod args;

use std::fmt;

use error_stack::{Context, FutureExt, Result};
use graph::datastore::PostgresDatabase;

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
    let _datastore = PostgresDatabase::new(&args.db_info)
        .change_context(GraphError)
        .await?;

    Ok(())
}
