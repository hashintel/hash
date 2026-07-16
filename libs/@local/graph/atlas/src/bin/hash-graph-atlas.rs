//! Standalone Atlas fitting and Axum serving process.

use hash_graph_atlas::{cli::run_with, fit::ProductionAtlasTrainer};

#[tokio::main]
async fn main() -> Result<(), hash_graph_atlas::cli::AtlasCliError> {
    run_with(std::env::args_os(), &ProductionAtlasTrainer).await
}
