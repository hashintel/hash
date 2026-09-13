//! Shared generation fixtures and real-service transfer cases.
//!
//! Unit tests reuse scratch setup here. The `test-utils` feature additionally exposes the S3
//! integration cases to the external test targets.

#[cfg(feature = "test-utils")]
mod integration;

#[cfg(feature = "test-utils")]
pub use self::integration::{
    download_corrupt_artifact, download_missing_current, download_replacement, promotion_initial,
    promotion_retention, promotion_stale_writer, upload_existing_corrupt, upload_repository,
};
#[cfg(test)]
pub(crate) use super::scratch::tests::{entry_count, root as scratch_root, scratch};
