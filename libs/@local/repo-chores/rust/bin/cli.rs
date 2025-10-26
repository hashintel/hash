use core::error::Error;

use clap::Parser as _;
use hash_repo_chores::cli::Args;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let args = Args::parse();

    args.run().await
}
