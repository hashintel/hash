//! Generation transfer and file-input integration against MinIO.
//!
//! Start the local MinIO service on port 9000 with access key `dev-s3-access-key-id` and secret
//! `dev-s3-secret-access-key`, then run `yarn workspace @rust/hash-graph-atlas test:integration`.
//! Each case creates its own bucket and local files. The test fails if the service is unavailable.

use hash_graph_atlas::test_utils;

#[tokio::test]
async fn upload_repository() {
    Box::pin(test_utils::upload_repository()).await;
}

#[tokio::test]
async fn upload_existing_corrupt() {
    Box::pin(test_utils::upload_existing_corrupt()).await;
}

#[tokio::test]
async fn promotion_initial() {
    Box::pin(test_utils::promotion_initial()).await;
}

#[tokio::test]
async fn promotion_stale_writer() {
    Box::pin(test_utils::promotion_stale_writer()).await;
}

#[tokio::test]
async fn promotion_retention_enabled() {
    Box::pin(test_utils::promotion_retention(true)).await;
}

#[tokio::test]
async fn promotion_retention_disabled() {
    Box::pin(test_utils::promotion_retention(false)).await;
}

#[tokio::test]
async fn remove_prefix_batches() {
    Box::pin(test_utils::remove_prefix_batches()).await;
}

#[tokio::test]
async fn download_replacement() {
    Box::pin(test_utils::download_replacement()).await;
}

#[tokio::test]
async fn download_missing_current() {
    Box::pin(test_utils::download_missing_current()).await;
}

#[tokio::test]
async fn download_corrupt_artifact() {
    Box::pin(test_utils::download_corrupt_artifact()).await;
}

#[tokio::test]
async fn file_input_materialization() {
    Box::pin(test_utils::file_input_materialization()).await;
}

#[tokio::test]
async fn multipart_file() {
    Box::pin(test_utils::multipart_file()).await;
}

#[tokio::test]
async fn multipart_copy() {
    Box::pin(test_utils::multipart_copy()).await;
}

#[tokio::test]
async fn multipart_destination_conflict() {
    Box::pin(test_utils::multipart_destination_conflict()).await;
}
