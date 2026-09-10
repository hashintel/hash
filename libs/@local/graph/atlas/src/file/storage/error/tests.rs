use core::assert_matches;
use std::io;

use aws_sdk_s3::{
    config::http::HttpResponse, error::SdkError, operation::get_object::GetObjectError,
    primitives::ByteStream, types::error::NoSuchKey,
};

use super::StorageError;

#[test]
fn request_service_metadata() {
    let response = HttpResponse::new(
        404.try_into().expect("should accept an HTTP status"),
        ByteStream::from_static(b"response details").into_inner(),
    );
    let error = SdkError::service_error(
        GetObjectError::NoSuchKey(NoSuchKey::builder().message("missing source").build()),
        response,
    );
    let StorageError::Request(error) = StorageError::from(error) else {
        panic!("should retain the request error");
    };
    assert_matches!(error.as_service_error(), Some(aws_sdk_s3::Error::NoSuchKey(error)) if error.message() == Some("missing source"));
    let response = error
        .raw_response()
        .expect("should retain the service response");
    assert_eq!(
        response.status().as_u16(),
        404,
        "should preserve the raw status"
    );
    assert_eq!(
        response.body().bytes(),
        Some(b"response details".as_slice()),
        "should preserve the raw response body"
    );
}

#[test]
fn request_construction_failure() {
    let error =
        SdkError::<GetObjectError>::construction_failure(io::Error::other("fixture failure"));
    let StorageError::Request(error) = StorageError::from(error) else {
        panic!("should retain the request error");
    };
    assert_matches!(error.as_ref(), SdkError::ConstructionFailure(_));
}
