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

/// Publishes a byte-bound fixture for tests of activation decisions.
///
/// # Panics
///
/// Panics when staging or publication fails.
#[cfg(test)]
pub(crate) fn publish_fixture(root: &super::GenerationRoot) -> super::GenerationId {
    let repository = super::fixture::repository();
    let staging = root.stage().expect("should create fixture staging");
    super::fixture::stage_all(&staging, &repository);
    staging
        .seal(&repository)
        .expect("should publish fixture")
        .id()
}
