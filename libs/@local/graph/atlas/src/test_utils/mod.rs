//! Real-service integration cases for Atlas publication, acquisition and file inputs.
//!
//! The `test-utils` feature exposes these cases to the integration targets while keeping the
//! underlying implementation crate-private. Each case arranges its own data on the local test
//! services and awaits cleanup before returning.

pub(crate) mod postgres;
pub(crate) mod s3;

pub use crate::{
    file::{
        generation::test_utils::{
            download_corrupt_artifact, download_missing_current, download_replacement,
            promotion_initial, promotion_stale_writer, upload_existing_corrupt, upload_repository,
        },
        storage::s3::test_utils::{
            file_input_materialization, multipart_copy, multipart_destination_conflict,
            multipart_file,
        },
    },
    serve::tests::integration::RouteFixture,
};
